import React from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';
import { sentinelAgent } from '../lib/autoHealAgent';

interface SentinelErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class SentinelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  SentinelErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): SentinelErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Unexpected workspace error.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    sentinelAgent.reportRuntimeError(
      error,
      `React ErrorBoundary${info.componentStack ? ` (${info.componentStack.split('\n')[1]?.trim() || 'tree'})` : ''}`
    );
  }

  handleRecover = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] bg-[#0F1014] text-zinc-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#18181B] border border-white/10 p-6 space-y-4 text-center shadow-2xl">
            <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-bold text-zinc-50">
                Sentinel Recovered Workspace
              </h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                A rendering exception was intercepted and logged so your academy session stays intact.
              </p>
              {this.state.errorMessage && (
                <p className="text-[11px] font-mono-tabular text-amber-300 bg-[#121216] border border-white/10 rounded-lg px-3 py-2 break-words">
                  {this.state.errorMessage}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={this.handleRecover}
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restore Chess Workspace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
