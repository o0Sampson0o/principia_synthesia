"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Show the technical error message (editors only — readers get calm copy). */
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class MdxErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch() {
    // Silently handled — fallback UI is shown instead
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="themed-surface border themed-border rounded-lg px-4 py-3 text-sm">
            <p className="mb-1 ps-mono-micro" style={{ color: "var(--color-error)" }}>
              Display error
            </p>
            <p className="themed-secondary">
              This article&rsquo;s content couldn&rsquo;t be displayed — its source contains a
              formatting error. The rest of the page still works.
            </p>
            {this.props.showDetails && (
              <details className="mt-2">
                <summary className="text-xs themed-muted cursor-pointer themed-hover-foreground">
                  Technical details (visible to editors only)
                </summary>
                <pre className="mt-2 text-xs themed-muted whitespace-pre-wrap font-mono">
                  {this.state.error?.message}
                </pre>
              </details>
            )}
          </div>
        )
      );
    }

    return this.props.children;
  }
}
