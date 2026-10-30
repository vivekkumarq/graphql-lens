import {
  GraphQLError,
  Kind,
  parse,
  print,
  visit,
  type DocumentNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from 'graphql';
import type { GraphQLOperation, OperationStructure, OperationType } from '../types/graphql';
import type { RawOperation } from './detector';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function persistedHash(ext: unknown): string | undefined {
  const pq = isObject(ext) ? ext.persistedQuery : undefined;
  return isObject(pq) && typeof pq.sha256Hash === 'string' ? pq.sha256Hash : undefined;
}

function errorMessage(e: unknown): string {
  if (e instanceof GraphQLError) {
    const loc = e.locations?.[0];
    return loc ? `${e.message} (line ${loc.line}, column ${loc.column})` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Best-effort type and name for documents the parser rejects. */
function guess(query: string): { type?: OperationType; name?: string } {
  const src = query.replace(/#[^\n\r]*/g, '');
  const m = src.match(/(?:^|\})\s*(query|mutation|subscription)\b\s*([_A-Za-z]\w*)?/);
  if (m) return { type: m[1] as OperationType, name: m[2] };
  return src.trim().startsWith('{') ? { type: 'query' } : {};
}

interface Measure {
  depth: number;
  fields: number;
}

function measure(
  set: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  memo: Map<string, Measure>,
  active: Set<string>,
): Measure {
  let depth = 0;
  let fields = 0;
  for (const sel of set.selections) {
    let m: Measure | undefined;
    if (sel.kind === Kind.FIELD) {
      const inner = sel.selectionSet
        ? measure(sel.selectionSet, fragments, memo, active)
        : { depth: 0, fields: 0 };
      m = { depth: inner.depth + 1, fields: inner.fields + 1 };
    } else if (sel.kind === Kind.INLINE_FRAGMENT) {
      m = measure(sel.selectionSet, fragments, memo, active);
    } else {
      const name = sel.name.value;
      const frag = fragments.get(name);
      if (frag && !active.has(name)) {
        // memoised so fragment-heavy documents stay linear; `active` breaks invalid cycles
        m = memo.get(name);
        if (!m) {
          active.add(name);
          m = measure(frag.selectionSet, fragments, memo, active);
          active.delete(name);
          memo.set(name, m);
        }
      }
    }
    if (m) {
      depth = Math.max(depth, m.depth);
      fields += m.fields;
    }
  }
  return { depth, fields };
}

function structureOf(doc: DocumentNode, op: OperationDefinitionNode): OperationStructure {
  const fragments = new Map<string, FragmentDefinitionNode>();
  let operationCount = 0;
  for (const d of doc.definitions) {
    if (d.kind === Kind.FRAGMENT_DEFINITION) fragments.set(d.name.value, d);
    if (d.kind === Kind.OPERATION_DEFINITION) operationCount++;
  }
  const directives = new Set<string>();
  const spreads = new Set<string>();
  visit(doc, {
    Directive: (node) => void directives.add('@' + node.name.value),
    FragmentSpread: (node) => void spreads.add(node.name.value),
  });
  const { depth, fields } = measure(op.selectionSet, fragments, new Map(), new Set());
  return {
    fields: op.selectionSet.selections.map((s) =>
      s.kind === Kind.FIELD
        ? s.alias
          ? `${s.alias.value}: ${s.name.value}`
          : s.name.value
        : s.kind === Kind.FRAGMENT_SPREAD
          ? `...${s.name.value}`
          : `... on ${s.typeCondition?.name.value ?? '?'}`,
    ),
    fragments: [...fragments.keys()],
    fragmentSpreads: [...spreads],
    directives: [...directives],
    variableDefinitions: (op.variableDefinitions ?? []).map((v) => ({
      name: v.variable.name.value,
      type: print(v.type),
      ...(v.defaultValue ? { defaultValue: print(v.defaultValue) } : {}),
    })),
    depth,
    fieldCount: fields,
    operationCount,
  };
}

const anonymousName = (fields: string[]): string =>
  fields.length
    ? `(anonymous) ${fields.slice(0, 2).join(', ')}${fields.length > 2 ? ', …' : ''}`
    : '(anonymous)';

/** Parse one raw operation with the reference GraphQL parser. Never throws. */
export function analyzeOperation(raw: RawOperation, index: number): GraphQLOperation {
  const sentName = raw.operationName || undefined;
  const hash = persistedHash(raw.extensions);
  const base = {
    index,
    query: raw.query,
    variables: raw.variables,
    extensions: raw.extensions,
    persistedQueryHash: hash,
    operationName: sentName,
  };

  if (raw.malformed) return { ...base, name: sentName ?? '(malformed operation)', parseError: raw.malformed };
  if (!raw.query)
    return { ...base, name: sentName ?? (hash ? `persisted ${hash.slice(0, 10)}…` : '(anonymous)') };

  let doc: DocumentNode;
  try {
    doc = parse(raw.query, { noLocation: true });
  } catch (e) {
    const g = guess(raw.query);
    return {
      ...base,
      name: sentName ?? g.name ?? '(unparsable)',
      operationName: sentName ?? g.name,
      operationType: g.type,
      parseError: errorMessage(e),
    };
  }

  const ops = doc.definitions.filter(
    (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
  );
  const op = (sentName && ops.find((o) => o.name?.value === sentName)) || ops[0];
  if (!op)
    return { ...base, name: sentName ?? '(fragments only)', parseError: 'Document contains no operation' };

  const structure = structureOf(doc, op);
  const name = op.name?.value ?? sentName;
  return {
    ...base,
    name: name ?? anonymousName(structure.fields),
    operationName: name,
    operationType: op.operation as OperationType,
    structure,
    ...(sentName && ops.length > 1 && !ops.some((o) => o.name?.value === sentName)
      ? { parseError: `operationName "${sentName}" does not match any operation in the document` }
      : {}),
  };
}
