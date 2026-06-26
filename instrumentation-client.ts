import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance tracing. Lower in production via tracesSampler if volume is high.
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Session Replay — record every session at 10%, and always on error.
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  integrations: [
    Sentry.replayIntegration(),
  ],
});

// Captures App Router navigation transitions for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
