"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";

export default function PublisherError({
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
    <main className="max-w-2xl mx-auto px-6 py-16 text-center">
      <p className="ps-eyebrow mb-4">Error</p>
      <h1 className="ps-display themed-heading mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
        Something went wrong
      </h1>
      <p className="themed-muted mb-10" style={{ fontSize: "0.9375rem" }}>
        The page could not be rendered. The error has been reported.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={reset} className="themed-btn-accent rounded-lg" style={{ fontSize: "0.9375rem", padding: "0.625rem 1.5rem" }}>
          Try again
        </button>
        <Link href="/" className="themed-btn-ghost" style={{ fontSize: "0.9375rem" }}>
          Home
        </Link>
      </div>
    </main>
  );
}
