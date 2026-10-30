import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  body?: string;
}

/** A bad payload must never blank the panel: show what failed and the raw data instead. */
export class ErrorBoundary extends Component<Props, { error: Error | null; raw: boolean }> {
  state = { error: null as Error | null, raw: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error, raw } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="banner bad" role="alert">
        <strong>Unable to display this view.</strong> {error.message}
        {this.props.body !== undefined && (
          <>
            {' '}
            <button className="link" onClick={() => this.setState({ raw: !raw })}>
              {raw ? 'Hide raw response' : 'Show raw response'}
            </button>
            {raw && <pre className="code-fallback">{this.props.body}</pre>}
          </>
        )}
      </div>
    );
  }
}
