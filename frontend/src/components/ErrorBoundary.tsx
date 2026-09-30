import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional custom fallback renderer */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Catches render-time errors in its subtree and shows a diagnostic panel
 * instead of blanking the whole app. In dev, Vite's overlay handles most
 * syntax/import errors; this catches runtime render exceptions.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the full stack in the console for debugging
    // eslint-disable-next-line no-console
    console.error("❌ Render error caught by <ErrorBoundary>:", error, info);
    this.setState({ info });
  }

  private reset = (): void => {
    this.setState({ error: null, info: null });
  };

  render(): ReactNode {
    const { error, info } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;
    if (fallback) return fallback(error, this.reset);

    return (
      <div className="m-4 p-4 rounded-lg border border-accent-red/40 bg-accent-red/5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-red" />
          <span className="text-accent-red font-semibold text-sm">
            Render error: {error.name}
          </span>
        </div>

        <div className="mono text-[11px] text-slate-200">{error.message}</div>

        <details className="text-xs">
          <summary className="cursor-pointer text-muted hover:text-white">
            Stack trace
          </summary>
          <pre className="mt-2 p-2 rounded bg-space-950/60 border border-white/5 text-[10px] mono text-muted whitespace-pre-wrap overflow-auto max-h-64">
            {error.stack}
            {info?.componentStack ? "\n\n--- component stack ---" + info.componentStack : ""}
          </pre>
        </details>

        <div className="flex gap-2">
          <button
            onClick={this.reset}
            className="px-3 py-1 text-xs rounded bg-white/5 hover:bg-white/10 border border-white/10"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 text-xs rounded bg-white/5 hover:bg-white/10 border border-white/10"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}