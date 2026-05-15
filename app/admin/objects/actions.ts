"use server";

import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createKaoSchema, updateKaoSchema, deleteKaoSchema } from "@/lib/validations";

async function requireAdmin() {
  const session = await getSession();
  if (!session?.isAdmin) throw new Error("Unauthorized");
}

export async function createKaoObject(_prevState: unknown, formData: FormData) {
  await requireAdmin();
  const raw = Object.fromEntries(formData);
  const parsed = createKaoSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  let content: unknown;
  try { content = JSON.parse(parsed.data.content); }
  catch { return { errors: { content: ["Invalid JSON"] } }; }

  const [row] = await db.insert(objects).values({
    slug: parsed.data.slug,
    name: parsed.data.name,
    type: parsed.data.type,
    content,
    description: parsed.data.description ?? null,
  }).returning();

  revalidatePath("/admin/objects");
  revalidatePath("/objects");
  redirect(`/admin/objects/${row.slug}`);
}

export async function updateKaoObject(_prevState: unknown, formData: FormData) {
  await requireAdmin();
  const raw = Object.fromEntries(formData);
  const parsed = updateKaoSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  let content: unknown;
  try { content = JSON.parse(parsed.data.content); }
  catch { return { errors: { content: ["Invalid JSON"] } }; }

  await db.update(objects).set({
    name: parsed.data.name,
    type: parsed.data.type,
    content,
    description: parsed.data.description ?? null,
    updatedAt: new Date(),
  }).where(eq(objects.id, parsed.data.id));

  revalidatePath("/admin/objects");
  revalidatePath(`/admin/objects/${parsed.data.slug}`);
  revalidatePath(`/objects/${parsed.data.slug}`);
  redirect(`/admin/objects/${parsed.data.slug}`);
}

export async function deleteKaoObject(formData: FormData) {
  await requireAdmin();
  const raw = Object.fromEntries(formData);
  const parsed = deleteKaoSchema.safeParse(raw);
  if (!parsed.success) return;

  await db.delete(objects).where(eq(objects.id, parsed.data.id));
  revalidatePath("/admin/objects");
  revalidatePath("/objects");
  redirect("/admin/objects");
}
