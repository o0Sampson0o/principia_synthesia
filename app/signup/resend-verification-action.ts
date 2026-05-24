"use server";

import { createVerificationToken } from "@/lib/auth";
import { sendEmail, buildVerificationEmailHtml } from "@/lib/email";
import { requireSession } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";

export async function resendVerificationEmailAction(): Promise<{ sent: boolean }> {
  const session = await requireSession();

  if (!rateLimit(`verify:${session.userId}`, 3, 60 * 60 * 1000)) {
    return { sent: false };
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || user.emailVerifiedAt) {
    return { sent: false };
  }

  const rawToken = await createVerificationToken(user.id);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.NODE_ENV === "production"
      ? "https://principia-synthesia.example"
      : `http://${(await headers()).get("host") ?? "localhost:3000"}`);
  const verificationUrl = `${siteUrl}/verify-email/${rawToken}`;

  await sendEmail({
    to: user.email,
    subject: "Verify your email address",
    html: buildVerificationEmailHtml(verificationUrl),
  });

  return { sent: true };
}
