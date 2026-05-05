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

  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, validated.email.toLowerCase().trim()))
    .limit(1);

  if (!user[0]) {
    redirect("/login?error=invalid");
  }

  const valid = await verifyPassword(validated.password, user[0].passwordHash);
  if (!valid) {
    redirect("/login?error=invalid");
  }

  await setSessionCookie({
    userId: user[0].id,
    email: user[0].email,
    isAdmin: user[0].isAdmin,
  });

  redirect("/");
}
