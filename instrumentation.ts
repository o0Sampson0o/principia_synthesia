import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in nested Server Components, route handlers, and
// data-fetching (Next.js 13.4+). Without this, those server errors are missed.
export const onRequestError = Sentry.captureRequestError;
