"use client";

import { Component, ReactNode } from "react";
import MdxErrorNotice from "./MdxErrorNotice";

/**
 * Catches errors thrown while *rendering* already-compiled article content —
 * a client component in the body blowing up (Mermaid, InlineAnimation), or a
 * server component nested in the compiled tree failing after the compile
 * succeeded.
 *
 * Compile failures are handled earlier and separately, in `<ArticleBody>`:
 * they happen inside an `await` in a server component, where a try/catch gives
 * a deterministic result instead of depending on error-boundary semantics
 * across the RSC boundary.
 */
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
          <MdxErrorNotice
            showDetails={this.props.showDetails}
            detail={this.state.error ? { reason: this.state.error.message } : null}
          />
        )
      );
    }

    return this.props.children;
  }
}
