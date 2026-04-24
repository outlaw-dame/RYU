import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Ryu UI error", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "var(--space-6)",
        background: "var(--color-bg)",
        color: "var(--color-text)"
      }}>
        <h1 style={{
          margin: "0 0 var(--space-2)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-title2)",
          lineHeight: "var(--leading-title2)"
        }}>Something went wrong</h1>
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--color-text-secondary)" }}>{error.message}</p>
        <button type="button" onClick={this.reset} style={{
          minHeight: "var(--touch-min)",
          border: 0,
          borderRadius: "var(--radius-md)",
          background: "var(--color-accent)",
          color: "white",
          fontWeight: 700,
          padding: "0 var(--space-4)"
        }}>Try Again</button>
      </div>
    );
  }
}
