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
      <h1 className="text-3xl font-bold themed-heading mb-4">
        Something went wrong loading this publisher
      </h1>
      <p className="themed-muted mb-8">
        The page could not be rendered. The error has been reported.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={reset} className="themed-btn-primary px-5 py-2">
          Try again
        </button>
        <Link href="/" className="themed-btn-ghost px-5 py-2">
          Home
        </Link>
      </div>
    </main>
  );
}
