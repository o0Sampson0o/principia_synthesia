/**
 * db/seed-admin.ts — minimal admin-only seed.
 *
 * Creates a single root-admin user from env vars. Skips silently if either
 * SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD is unset. Used by `npm run seed:admin`.
 *
 * Also seeds the corresponding publisher row so the admin can own content.
 */
import { db } from "./index";
import { users, publishers } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seedAdmin() {
  const email    = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("[seed:admin] Skipping: SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD not set.");
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Insert (or no-op) the admin user row
  await db.insert(users).values({
    email,
    passwordHash,
    isRootAdmin:   true,
    displayName:   "Admin",
    publisherSlug: "principia-official",
  }).onConflictDoNothing();

  // Fetch to get the ID for the publisher row
  const [adminRow] = await db.select().from(users).where(eq(users.email, email));
  if (!adminRow) {
    console.error("[seed:admin] Admin user not found after insert — aborting.");
    process.exit(1);
  }

  // Insert (or no-op) the publisher row
  await db.insert(publishers).values({
    slug:   "principia-official",
    kind:   "user",
    userId: adminRow.id,
    orgId:  null,
  }).onConflictDoNothing();

  console.log(`[seed:admin] Admin account ready: ${email} (publisher=principia-official)`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("[seed:admin] Fatal error:", err);
  process.exit(1);
});
