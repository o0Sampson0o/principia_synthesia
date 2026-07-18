"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validations";
import { ZodError } from "zod";

function isSafeRedirect(path: string | null): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (/[\r\n]/.test(path)) return false;
  return true;
}

export async function loginAction(formData: FormData): Promise<{ error: string } | void> {
  let validated: ReturnType<typeof loginSchema.parse>;
  try {
    validated = loginSchema.parse({
      email: (formData.get("email") as string | null)?.trim().toLowerCase() ?? "",
      password: formData.get("password"),
    });
  } catch (err) {
    if (err instanceof ZodError) return { error: "Please enter a valid email and password." };
    throw err;
  }

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
    .where(eq(users.email, validated.email))
    .limit(1);

  if (!row) {
    return { error: "Invalid email or password." };
  }

  const valid = await verifyPassword(validated.password, row.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password." };
  }

  await setSessionCookie({
    userId: row.id,
    email: row.email,
    userSlug: row.userSlug,
    isRootAdmin: row.isRootAdmin,
  });

  redirect(safeRedirect ?? `/${row.userSlug}`);
}
