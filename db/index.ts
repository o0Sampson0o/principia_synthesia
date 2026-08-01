import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// In production (Vercel), DATABASE_URL is injected by the platform.
// Locally, Next.js loads .env.local automatically for app routes.
// drizzle.config.ts handles dotenv for CLI commands (drizzle-kit).
const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
