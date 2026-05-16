import { db } from "./index";
import { users } from "./schema";
import bcrypt from "bcryptjs";

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("⚠ Skipping admin seed: SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD not set");
    process.exit(0);
  }

  const hash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    email,
    passwordHash: hash,
    isRootAdmin: true,
  }).onConflictDoNothing();
  console.log(`✓ Admin account seeded: ${email}`);
  process.exit(0);
}

seedAdmin().catch((e) => {
  console.error(e);
  process.exit(1);
});
