import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view';
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  foldGutter,
  foldKeymap,
  foldService,
  syntaxHighlighting,
} from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { json } from '@codemirror/lang-json';
import { tags as t } from '@lezer/highlight';

export type CodeLanguage = 'graphql' | 'json' | 'text';

const KEYWORDS = new Set([
  'query',
  'mutation',
  'subscription',
  'fragment',
  'on',
  'type',
  'interface',
  'union',
  'enum',
  'input',
  'scalar',
  'schema',
  'extend',
  'directive',
  'implements',
  'repeatable',
]);

/** Small GraphQL tokenizer; the full parser is not needed just to colour a document. */
const graphqlLanguage = StreamLanguage.define<{ inBlockString: boolean }>({
  name: 'graphql',
  startState: () => ({ inBlockString: false }),
  token(stream, state) {
    if (state.inBlockString) {
      if (stream.skipTo('"""')) {
        stream.match('"""');
        state.inBlockString = false;
      } else stream.skipToEnd();
      return 'string';
    }
    if (stream.eatSpace()) return null;
    if (stream.match('#')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('"""')) {
      state.inBlockString = true;
      return 'string';
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string';
    if (stream.match(/^\$[_A-Za-z]\w*/)) return 'variableName.special';
    if (stream.match(/^@[_A-Za-z]\w*/)) return 'meta';
    if (stream.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)) return 'number';
    if (stream.match('...')) return 'operator';
    if (stream.match(/^[_A-Za-z]\w*/)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return 'keyword';
      if (word === 'true' || word === 'false' || word === 'null') return 'atom';
      if (/^[A-Z]/.test(word)) return 'typeName';
      return stream.match(/^\s*:/, false) ? 'labelName' : 'propertyName';
    }
    stream.next();
    return 'punctuation';
  },
  languageData: { commentTokens: { line: '#' } },
});

/** Fold any line that ends in an opening bracket, up to its matching close. */
const bracketFold = foldService.of((state, lineStart, lineEnd) => {
  const line = state.doc.sliceString(lineStart, lineEnd).trimEnd();
  const open = line.at(-1);
  const close = open === '{' ? '}' : open === '[' ? ']' : open === '(' ? ')' : null;
  if (!close || !open) return null;
  const from = lineStart + line.length;
  const text = state.doc.sliceString(from, Math.min(state.doc.length, from + 2_000_000));
  let depth = 1;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) {
      const to = from + i;
      return state.doc.lineAt(to).number > state.doc.lineAt(from).number ? { from, to } : null;
    }
  }
  return null;
});

// Colours come from CSS variables, so light/dark switching needs no editor reconfiguration.
const highlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--syn-keyword)', fontWeight: '600' },
  { tag: [t.propertyName], color: 'var(--syn-field)' },
  { tag: [t.labelName], color: 'var(--syn-arg)' },
  { tag: t.typeName, color: 'var(--syn-type)' },
  { tag: t.special(t.variableName), color: 'var(--syn-variable)' },
  { tag: t.string, color: 'var(--syn-string)' },
  { tag: t.number, color: 'var(--syn-number)' },
  { tag: [t.bool, t.null, t.atom], color: 'var(--syn-atom)' },
  { tag: t.meta, color: 'var(--syn-directive)' },
  { tag: t.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.punctuation, t.operator, t.brace, t.squareBracket, t.separator], color: 'var(--syn-punct)' },
]);

const theme = EditorView.theme({
  '&': {
    color: 'var(--fg)',
    backgroundColor: 'var(--code-bg)',
    fontSize: 'var(--code-size)',
    height: '100%',
  },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.5' },
  '.cm-content': { caretColor: 'var(--fg)', padding: '6px 0' },
  '&.cm-focused': { outline: 'none' },
  '.cm-gutters': { backgroundColor: 'var(--code-bg)', color: 'var(--muted)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 10px', minWidth: '28px' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection) !important',
  },
  '.cm-searchMatch': { backgroundColor: 'var(--search-match)', outline: '1px solid var(--search-outline)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--search-current)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--selection-match)' },
  '.cm-matchingBracket': {
    backgroundColor: 'var(--selection-match)',
    outline: '1px solid var(--line-strong)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--bg-3)',
    border: '1px solid var(--line)',
    color: 'var(--muted)',
    padding: '0 4px',
  },
  '.cm-panels': { backgroundColor: 'var(--bg-2)', color: 'var(--fg)', fontFamily: 'var(--sans)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-panel.cm-search': { padding: '4px 8px', fontSize: '12px' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontSize: '12px' },
  '.cm-textfield': {
    backgroundColor: 'var(--input-bg)',
    color: 'var(--fg)',
    border: '1px solid var(--line-strong)',
    borderRadius: '3px',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--bg-3)',
    color: 'var(--fg)',
    border: '1px solid var(--line-strong)',
    borderRadius: '3px',
  },
});

export function editorExtensions(language: CodeLanguage, editable: boolean, wrap: boolean): Extension[] {
  return [
    lineNumbers(),
    foldGutter({ openText: '▾', closedText: '▸' }),
    highlightSpecialChars(),
    drawSelection(),
    bracketMatching(),
    highlightSelectionMatches(),
    search({ top: true }),
    syntaxHighlighting(highlight),
    theme,
    language === 'json' ? json() : language === 'graphql' ? graphqlLanguage : [],
    language === 'json' ? [] : bracketFold,
    wrap ? EditorView.lineWrapping : [],
    editable ? history() : [],
    EditorState.readOnly.of(!editable), // read-only still allows focus, selection and Ctrl+F
    keymap.of([...searchKeymap, ...foldKeymap, ...(editable ? historyKeymap : []), ...defaultKeymap]),
    EditorView.contentAttributes.of({ 'aria-label': `${language} ${editable ? 'editor' : 'viewer'}` }),
  ];
}
