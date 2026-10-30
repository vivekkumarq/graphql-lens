import { useState } from 'react';
import type { GraphQLRequest } from '../../types/graphql';
import { toHar, toJSONExport } from '../../export/har';
import { downloadFile, fileStamp } from '../utils/format';
import { toast } from '../utils/toast';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

type Scope = 'active' | 'selected' | 'visible' | 'all';

export function ExportDialog({
  open,
  onClose,
  active,
  selected,
  visible,
  all,
}: {
  open: boolean;
  onClose: () => void;
  active?: GraphQLRequest;
  selected: GraphQLRequest[];
  visible: GraphQLRequest[];
  all: GraphQLRequest[];
}) {
  const scopes: { id: Scope; label: string; items: GraphQLRequest[] }[] = [
    ...(active
      ? [{ id: 'active' as const, label: `This request (${active.operations[0]?.name})`, items: [active] }]
      : []),
    ...(selected.length > 1
      ? [{ id: 'selected' as const, label: `Selected requests (${selected.length})`, items: selected }]
      : []),
    { id: 'visible', label: `Requests matching the filters (${visible.length})`, items: visible },
    { id: 'all', label: `All captured requests (${all.length})`, items: all },
  ];
  const [scope, setScope] = useState<Scope>(selected.length > 1 ? 'selected' : active ? 'active' : 'visible');
  const [format, setFormat] = useState<'har' | 'json'>('har');
  const [credentials, setCredentials] = useState(false);
  const chosen = scopes.find((s) => s.id === scope) ?? scopes[0]!;

  const run = () => {
    const opts = { includeCredentials: credentials };
    const doc = format === 'har' ? toHar(chosen.items, opts) : toJSONExport(chosen.items, opts);
    downloadFile(
      `graphql-lens-${fileStamp()}.${format === 'har' ? 'har' : 'json'}`,
      JSON.stringify(doc, null, 2),
    );
    toast(`Exported ${chosen.items.length} request(s)`);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export requests"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={run} disabled={!chosen.items.length}>
            <Icon name="download" /> Export {chosen.items.length}
          </button>
        </>
      }
    >
      <fieldset>
        <legend>What</legend>
        {scopes.map((s) => (
          <label key={s.id} className="setting">
            <input type="radio" name="scope" checked={scope === s.id} onChange={() => setScope(s.id)} />
            <span>{s.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Format</legend>
        <label className="setting">
          <input type="radio" name="format" checked={format === 'har'} onChange={() => setFormat('har')} />
          <span>
            HAR 1.2 <small>Opens in any browser's DevTools and can be imported back here</small>
          </span>
        </label>
        <label className="setting">
          <input type="radio" name="format" checked={format === 'json'} onChange={() => setFormat('json')} />
          <span>
            GraphQL JSON <small>Operations, variables and parsed responses, easy to read or diff</small>
          </span>
        </label>
      </fieldset>
      <label className="setting">
        <input type="checkbox" checked={credentials} onChange={(e) => setCredentials(e.target.checked)} />
        <span>
          Include credentials
          <small>
            {credentials
              ? '⚠ Authorization, Cookie and API-key values will be in the file. Do not share it.'
              : 'Sensitive header values are replaced with [redacted]'}
          </small>
        </span>
      </label>
    </Dialog>
  );
}
