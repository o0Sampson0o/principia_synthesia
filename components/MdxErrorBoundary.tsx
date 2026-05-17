"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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
          <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 bg-opacity-50 dark:bg-red-950 dark:bg-opacity-10">
            <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
              Failed to render content
            </p>
            <details>
              <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300">
                Error details
              </summary>
              <pre className="mt-2 text-xs text-red-500 dark:text-red-400 whitespace-pre-wrap font-mono">
                {this.state.error?.message}
              </pre>
            </details>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
