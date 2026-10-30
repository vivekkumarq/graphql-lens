export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();
let seq = 0;

export function toast(message: string, kind: Toast['kind'] = 'info') {
  const t = { id: ++seq, message, kind };
  for (const l of listeners) l(t);
}

export function onToast(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
