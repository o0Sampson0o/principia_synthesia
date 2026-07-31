import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// In production (Vercel), DATABASE_URL is injected by the platform.
// Locally, Next.js loads .env.local automatically for app routes.
// drizzle.config.ts handles dotenv for CLI commands (drizzle-kit).
//
// `idle_timeout` is critical on Neon, not just a tuning knob. Neon suspends the
// compute endpoint (scale-to-zero) only while *no* client connection is open,
// and postgres.js defaults to `idle_timeout: null` — an idle socket is held
// until `max_lifetime` (30–60 min) expires. That means a single request pins
// the compute awake for up to an hour, so even trickle traffic keeps it billing
// around the clock and exhausts the monthly compute quota.
//
// Closing idle sockets after 20s lets the endpoint suspend between bursts. The
// cost is a cold start (~500ms) on the next request after an idle gap.
const client = postgres(process.env.DATABASE_URL!, {
  idle_timeout: 20,
  // Each Fluid Compute instance gets its own pool; keep it small so concurrent
  // instances don't fan out into many Neon connections.
  max: 5,
  connect_timeout: 15,
});
export const db = drizzle(client, { schema });
