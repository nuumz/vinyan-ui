import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="bg-surface rounded-lg border border-red/30 p-6 m-4">
          <h3 className="text-red font-medium mb-2">Something went wrong</h3>
          <p className="text-sm text-text-dim mb-3">{this.state.error?.message}</p>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
