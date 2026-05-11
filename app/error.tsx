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
      <h2 className="text-2xl font-bold themed-heading mb-4">
        Something went wrong
      </h2>
      <p className="text-sm themed-muted mb-6 max-w-md">
        An unexpected error occurred. The error has been reported automatically.
        {error.digest && (
          <span className="block mt-2 font-mono text-xs">
            Error ID: {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={reset}
        className="themed-btn-primary"
      >
        Try again
      </button>
    </div>
  );
}
