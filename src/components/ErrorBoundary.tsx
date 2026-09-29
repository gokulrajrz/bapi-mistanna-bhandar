import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="section empty">
        <h1>Something interrupted your visit.</h1>
        <p>Your saved bag will be here when you reload.</p>
        <button className="button" onClick={() => window.location.reload()}>
          Reload the store
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
