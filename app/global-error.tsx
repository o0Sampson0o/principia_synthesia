"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Global error boundary. Unlike app/error.tsx (a segment boundary), this
 * catches errors thrown in the root layout itself, so it must render its own
 * <html>/<body>. Reports to Sentry before showing a minimal fallback.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error#global-error
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
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          color: "#1a1a1a",
          background: "#fafafa",
        }}
      >
        <p
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: "0.75rem",
            opacity: 0.6,
            marginBottom: "1rem",
          }}
        >
          Error
        </p>
        <h1 style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", marginBottom: "1rem" }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: "0.9375rem", opacity: 0.7, maxWidth: "28rem", marginBottom: "2rem" }}>
          An unexpected error occurred. The error has been reported automatically.
          {error.digest && (
            <span
              style={{ display: "block", marginTop: "0.5rem", fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}
            >
              Error ID: {error.digest}
            </span>
          )}
        </p>
        <button
          onClick={reset}
          style={{
            fontSize: "0.9375rem",
            padding: "0.625rem 1.5rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#1a1a1a",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
