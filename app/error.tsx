"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root error boundary for the application.
 * Captures unexpected errors to Sentry and renders a user-friendly fallback.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-6 text-center">
      <p className="ps-eyebrow mb-4">Error</p>
      <h2 className="ps-display themed-heading mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
        Something went wrong
      </h2>
      <p className="themed-muted mb-8 max-w-md" style={{ fontSize: "0.9375rem" }}>
        An unexpected error occurred. The error has been reported automatically.
        {error.digest && (
          <span className="block mt-2 font-mono" style={{ fontSize: "0.75rem" }}>
            Error ID: {error.digest}
          </span>
        )}
      </p>
      <button onClick={reset} className="themed-btn-accent rounded-lg" style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}>
        Try again
      </button>
    </div>
  );
}
