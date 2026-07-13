"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession, hashPassword, verifyPassword } from "@/lib/auth";
import { updateDisplayNameSchema, changePasswordSchema } from "@/lib/validations";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Updates the signed-in user's display name. */
export async function updateDisplayName(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = updateDisplayNameSchema.safeParse({ displayName: formData.get("displayName") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await db
    .update(users)
    .set({ displayName: parsed.data.displayName })
    .where(eq(users.id, session.userId));
  revalidatePath("/settings/account");
  revalidatePath(`/${session.userSlug}`);
  return { ok: true, message: "Display name updated." };
}

/** Changes the signed-in user's password after verifying the current one. */
export async function changePassword(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) return { ok: false, error: "Account not found" };

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { ok: false, error: "Current password is incorrect." };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword) })
    .where(eq(users.id, session.userId));

  return { ok: true, message: "Password changed." };
}
