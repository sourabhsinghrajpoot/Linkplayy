import React from "react";

/**
 * Simple ErrorBoundary so a runtime crash in a subtree doesn't blank the whole page.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[LinkPlay ErrorBoundary]", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-14 h-14 rounded-2xl bg-[#e63946] flex items-center justify-center">
          <span className="font-mono-lp text-2xl">!</span>
        </div>
        <div className="font-display text-3xl font-bold text-center">
          Something went wrong.
        </div>
        <div className="text-zinc-400 text-sm max-w-md text-center font-mono-lp">
          {String(this.state.error?.message || this.state.error || "Unknown error")}
        </div>
        <button
          onClick={() => {
            this.handleReset();
            window.location.href = "/";
          }}
          className="mt-2 px-5 py-2.5 rounded-lg bg-[#e63946] hover:bg-[#f04856] text-white font-semibold transition-colors"
          data-testid="error-reset-btn"
        >
          Reload
        </button>
      </div>
    );
  }
}
