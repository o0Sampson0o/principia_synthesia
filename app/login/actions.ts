"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validations";

export async function loginAction(formData: FormData) {
  const validated = loginSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

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
    redirect("/login?error=invalid");
  }

  const valid = await verifyPassword(validated.password, row.passwordHash);
  if (!valid) {
    redirect("/login?error=invalid");
  }

  await setSessionCookie({
    userId: row.id,
    email: row.email,
    userSlug: row.userSlug,
    isRootAdmin: row.isRootAdmin,
  });

  redirect(`/${row.userSlug}`);
}
