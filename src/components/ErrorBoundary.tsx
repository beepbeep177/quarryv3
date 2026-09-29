import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Short name of the area, shown in the message (e.g. "this page"). */
  area?: string;
  /** Full-screen fallback for the app root. */
  fullScreen?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const card = (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle size={22} />
        </div>
        <h2 className="font-semibold text-slate-800">Something went wrong in {this.props.area ?? 'this page'}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your saved records are safe. Try again, or reload the page. If it keeps happening, send a screenshot of this message to the admin.
        </p>
        <p className="mt-3 break-words rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">{error.message || String(error)}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={this.reset} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Try Again
          </button>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
            <RefreshCw size={14} /> Reload Page
          </button>
        </div>
      </div>
    );

    if (this.props.fullScreen) {
      return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">{card}</div>;
    }
    return <div className="py-10">{card}</div>;
  }
}
