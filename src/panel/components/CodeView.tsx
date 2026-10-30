import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { foldAll, unfoldAll } from '@codemirror/language';
import { openSearchPanel } from '@codemirror/search';
import { editorExtensions, type CodeLanguage } from '../codemirror/setup';
import { CopyButton } from './CopyButton';
import { Icon } from './Icon';

export interface CodeViewProps {
  value: string;
  language: CodeLanguage;
  editable?: boolean;
  onChange?: (value: string) => void;
  label?: string;
  height?: string; // CSS height; defaults to fitting the content up to the pane
  toolbar?: boolean;
}

/** CodeMirror 6 viewer/editor. Loaded lazily so the panel opens fast. */
export default function CodeView({
  value,
  language,
  editable = false,
  onChange,
  label,
  height,
  toolbar = true,
}: CodeViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const [wrap, setWrap] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          editorExtensions(language, editable, wrap),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // value is synced by the effect below; recreating on every keystroke would lose the cursor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, editable, wrap]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  const exec = (cmd: (v: EditorView) => boolean) => {
    if (view.current) {
      cmd(view.current);
      view.current.focus();
    }
  };

  return (
    <div className="code-view" style={height ? { height } : undefined}>
      {toolbar && (
        <div className="code-toolbar">
          {label && <span className="code-label">{label}</span>}
          <span className="spacer" />
          <button
            className="icon-btn"
            title="Search (Ctrl+F inside the editor)"
            onClick={() => exec(openSearchPanel)}
          >
            <Icon name="search" />
          </button>
          <button className="icon-btn" title="Collapse all" onClick={() => exec(foldAll)}>
            <Icon name="collapse" />
          </button>
          <button className="icon-btn" title="Expand all" onClick={() => exec(unfoldAll)}>
            <Icon name="expand" />
          </button>
          <button
            className={`icon-btn ${wrap ? 'on' : ''}`}
            title="Wrap long lines"
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
          >
            <Icon name="wrap" />
          </button>
          <CopyButton text={value} label={label ? `Copy ${label.toLowerCase()}` : 'Copy'} />
        </div>
      )}
      <div className="code-host" ref={host} />
    </div>
  );
}
