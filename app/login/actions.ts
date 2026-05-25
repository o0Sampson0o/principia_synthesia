"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validations";

function isSafeRedirect(path: string | null): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (/[\r\n]/.test(path)) return false;
  return true;
}

export async function loginAction(formData: FormData) {
  const validated = loginSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const redirectRaw = formData.get("redirect");
  const safeRedirect = typeof redirectRaw === "string" && isSafeRedirect(redirectRaw) ? redirectRaw : null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      isRootAdmin: users.isRootAdmin,
      userSlug: users.publisherSlug,
    })
    .from(users)
    .where(eq(users.email, validated.email.toLowerCase().trim()))
    .limit(1);

  if (!row) {
    const errorUrl = safeRedirect
      ? `/login?error=invalid&redirect=${encodeURIComponent(safeRedirect)}`
      : "/login?error=invalid";
    redirect(errorUrl);
  }

  const valid = await verifyPassword(validated.password, row.passwordHash);
  if (!valid) {
    const errorUrl = safeRedirect
      ? `/login?error=invalid&redirect=${encodeURIComponent(safeRedirect)}`
      : "/login?error=invalid";
    redirect(errorUrl);
  }

  await setSessionCookie({
    userId: row.id,
    email: row.email,
    userSlug: row.userSlug,
    isRootAdmin: row.isRootAdmin,
  });

  redirect(safeRedirect ?? `/${row.userSlug}`);
}
