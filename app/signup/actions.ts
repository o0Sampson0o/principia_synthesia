"use server";

import { db } from "@/db";
import { users, publishers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signupSchema } from "@/lib/validations";

export async function signupAction(formData: FormData) {
  const validated = signupSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
    publisherSlug: formData.get("publisherSlug"),
  });

  const emailNormalized = validated.email.toLowerCase().trim();

  // Check email uniqueness
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, emailNormalized))
    .limit(1);
  if (existingUser.length > 0) {
    redirect("/signup?error=email_taken");
  }

  // Check slug uniqueness across all publishers (users and orgs)
  const existingSlug = await db
    .select({ id: publishers.id })
    .from(publishers)
    .where(eq(publishers.slug, validated.publisherSlug))
    .limit(1);
  if (existingSlug.length > 0) {
    redirect("/signup?error=slug_taken");
  }

  // Create user, publisher row, and update publisherSlug in a transaction
  const passwordHash = await hashPassword(validated.password);

  const newUser = await db.transaction(async (tx) => {
    // Insert user with a temporary empty publisherSlug (filled below)
    const [insertedUser] = await tx
      .insert(users)
      .values({
        email: emailNormalized,
        passwordHash,
        isRootAdmin: false,
        displayName: validated.displayName,
        publisherSlug: validated.publisherSlug,
      })
      .returning({ id: users.id, email: users.email });

    // Insert publishers row
    await tx.insert(publishers).values({
      slug: validated.publisherSlug,
      kind: "user",
      userId: insertedUser.id,
    });

    return insertedUser;
  });

  await setSessionCookie({
    userId: newUser.id,
    email: newUser.email,
    userSlug: validated.publisherSlug,
    isRootAdmin: false,
  });

  redirect(`/${validated.publisherSlug}`);
}
