import { lazy, Suspense } from 'react';
import type { CodeViewProps } from './CodeView';

const CodeView = lazy(() => import('./CodeView'));

/** Shows plain text instantly, then upgrades to the CodeMirror view once its chunk has loaded. */
export function Code(props: CodeViewProps) {
  return (
    <Suspense fallback={<pre className="code-fallback">{props.value}</pre>}>
      <CodeView {...props} />
    </Suspense>
  );
}
