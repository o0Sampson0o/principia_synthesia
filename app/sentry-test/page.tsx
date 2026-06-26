"use client";

/**
 * /sentry-test — TEMPORARY Sentry pipeline verification (client runtime).
 *
 * The button throws an uncaught error so Sentry's client SDK captures it,
 * confirming instrumentation-client.ts loaded (i.e. withSentryConfig works).
 * Delete this page once Sentry capture is confirmed working.
 */
export default function SentryTestPage() {
  return (
    <main style={{ maxWidth: "32rem", margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Sentry test</h1>
      <p style={{ opacity: 0.7, marginBottom: "2rem", fontSize: "0.9375rem" }}>
        Click to throw a client-side error. It should appear in Sentry within ~30s.
        Visit <code>/api/sentry-test</code> for the server-side check.
      </p>
      <button
        onClick={() => {
          throw new Error("Sentry client test error — pipeline verification (safe to ignore)");
        }}
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
        Throw client error
      </button>
    </main>
  );
}
