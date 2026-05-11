import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  error: Error | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep this minimal for Phase 1 — just surface to the dev console.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div className="flex h-full min-h-[200px] items-center justify-center bg-stoop-canvas p-6">
          <div className="max-w-md rounded-card border border-stoop-hairline bg-stoop-panel p-6 text-stoop-ink shadow-soft">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
              Something went wrong
            </div>
            <h2 className="display mb-2 text-[22px] leading-[1.2]">
              We hit a snag rendering this view.
            </h2>
            <p className="mb-4 text-[14px] text-stoop-ink-soft">
              The page ran into an unexpected error. Reloading usually clears it up.
              {this.state.error.message && (
                <span className="mt-2 block font-mono text-[12px] text-stoop-muted">
                  {this.state.error.message}
                </span>
              )}
            </p>
            <button
              type="button"
              className="btn-primary text-[13px]"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
