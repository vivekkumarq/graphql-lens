import { lazy, Suspense } from 'react';
import type { CodeViewProps } from './CodeView';

const load = () => import('./CodeView');
const CodeView = lazy(load);
// Fetch and compile the editor while the panel is idle, so the first click doesn't wait ~150 ms for it.
globalThis.requestIdleCallback?.(() => void load(), { timeout: 3000 });

/** Shows plain text instantly, then upgrades to the CodeMirror view once its chunk has loaded. */
export function Code(props: CodeViewProps) {
  return (
    <Suspense fallback={<pre className="code-fallback">{props.value}</pre>}>
      <CodeView {...props} />
    </Suspense>
  );
}
