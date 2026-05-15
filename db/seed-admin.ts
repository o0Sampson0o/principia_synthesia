import { db } from "./index";
import { users } from "./schema";
import bcrypt from "bcryptjs";

async function seedAdmin() {
  const hash = await bcrypt.hash("<redacted>", 10);
  await db.insert(users).values({
    email: "admin@example.com",
    passwordHash: hash,
    isAdmin: true,
  }).onConflictDoNothing();
  console.log("Admin account created (or already exists)");
  process.exit(0);
}

seedAdmin().catch((e) => {
  console.error(e);
  process.exit(1);
});
