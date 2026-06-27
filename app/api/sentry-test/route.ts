/**
 * GET /api/sentry-test  — TEMPORARY Sentry server-runtime diagnostic.
 *
 * Instead of throwing (which relies on onRequestError + the SDK flushing
 * before the serverless function freezes), this explicitly captures an event
 * and *awaits a flush*, then reports what happened as JSON. This isolates
 * whether the server SDK can send to Sentry at all, separately from the
 * onRequestError path. Delete once server capture is confirmed.
 */

import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const dsnConfigured = Boolean(
    process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  );
  const client = Sentry.getClient();
  const initialized = Boolean(client);

  const eventId = Sentry.captureException(
    new Error("Sentry server DIAGNOSTIC — explicit capture + flush")
  );

  // Block until the event is actually sent (or 5s passes). On serverless this
  // is the difference between the event arriving and being dropped on freeze.
  const flushed = await Sentry.flush(5000);

  return Response.json({
    dsnConfigured,
    sdkInitialized: initialized,
    eventId: eventId ?? null,
    flushed,
    runtime: process.env.NEXT_RUNTIME ?? "unknown",
  });
}
