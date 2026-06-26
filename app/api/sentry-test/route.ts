/**
 * GET /api/sentry-test  — TEMPORARY Sentry pipeline verification.
 *
 * Emits a metric and then throws, so the error surfaces in Sentry via the
 * onRequestError hook (server runtime) with a readable, source-mapped trace.
 * Delete this route once Sentry capture is confirmed working.
 */

import * as Sentry from "@sentry/nextjs";

export async function GET() {
  Sentry.metrics.count("sentry_test_metric", 1);
  throw new Error("Sentry server test error — pipeline verification (safe to ignore)");
}
