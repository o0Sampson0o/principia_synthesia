"use server";

import { db } from "@/db";
import { isUniqueViolation } from "@/lib/db-errors";
import { users, publishers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, setSessionCookie, createVerificationToken } from "@/lib/auth";
import { sendEmail, buildVerificationEmailHtml } from "@/lib/email";
import { redirect } from "next/navigation";
import { signupSchema } from "@/lib/validations";
import { headers } from "next/headers";
import { ZodError } from "zod";

export async function signupAction(formData: FormData): Promise<{ error: string } | void> {
  const rawEmail = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  let validated: ReturnType<typeof signupSchema.parse>;
  try {
    validated = signupSchema.parse({
      email: rawEmail,
      password: formData.get("password"),
      displayName: formData.get("displayName"),
      publisherSlug: formData.get("publisherSlug"),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: err.issues[0]?.message ?? "Please check the form and try again." };
    }
    throw err;
  }

  const emailNormalized = validated.email;

  // Check email uniqueness
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, emailNormalized))
    .limit(1);
  if (existingUser.length > 0) {
    return { error: "That email address is already in use." };
  }

  // Check slug uniqueness across all publishers (users and orgs)
  const existingSlug = await db
    .select({ id: publishers.id })
    .from(publishers)
    .where(eq(publishers.slug, validated.publisherSlug))
    .limit(1);
  if (existingSlug.length > 0) {
    return { error: "That publisher slug is already taken." };
  }

  // Create user, publisher row, and update publisherSlug in a transaction
  const passwordHash = await hashPassword(validated.password);

  let newUser;
  try {
    newUser = await db.transaction(async (tx) => {
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
  } catch (err) {
    // Race between the pre-checks above and the insert
    if (isUniqueViolation(err)) return { error: "That publisher slug is already taken." };
    throw err;
  }

  const rawToken = await createVerificationToken(newUser.id);

  const headerStore = await headers();
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const verificationUrl = `${proto}://${host}/verify-email/${rawToken}`;

  await sendEmail({
    to: newUser.email,
    subject: "Verify your email address",
    html: buildVerificationEmailHtml(verificationUrl),
  });

  await setSessionCookie({
    userId: newUser.id,
    email: newUser.email,
    userSlug: validated.publisherSlug,
    isRootAdmin: false,
  });

  redirect("/signup/check-email");
}
