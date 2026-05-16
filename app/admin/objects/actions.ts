"use server";

import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq, ilike } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createKaoSchema, updateKaoSchema, deleteKaoSchema, kaoSlugSchema } from "@/lib/validations";

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

export async function updateKaoObject(_prevState: unknown, formData: FormData): Promise<{ errors: Partial<Record<string, string[]>> } | void> {
  await requireAdmin();
  const raw = Object.fromEntries(formData);
  const parsed = updateKaoSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  let content: unknown;
  try { content = JSON.parse(parsed.data.content); }
  catch { return { errors: { content: ["Invalid JSON"] } }; }

  const [existing] = await db.select({ source: objects.source }).from(objects).where(eq(objects.id, parsed.data.id)).limit(1);
  if (existing?.source === "plugin") return { errors: { _form: ["Plugin objects cannot be edited directly."] } };

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

  const id = parsed.data.id;
  const [target] = await db.select({ source: objects.source }).from(objects).where(eq(objects.id, id)).limit(1);
  if (target?.source === "plugin") return;

  await db.delete(objects).where(eq(objects.id, id));
  revalidatePath("/admin/objects");
  revalidatePath("/objects");
  redirect("/admin/objects");
}

export async function cloneKaoObject(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session?.isAdmin) return;

  const slug = (formData.get("slug") as string ?? "").trim();
  const parsed = kaoSlugSchema.safeParse(slug);
  if (!parsed.success) return;

  const [source] = await db.select().from(objects).where(eq(objects.slug, slug)).limit(1);
  if (!source) return;
  if (source.source !== "plugin") return;

  // Find an unused slug: <slug>-copy, <slug>-copy-2, ...
  const base = `${slug}-copy`;
  const existing = await db.select({ slug: objects.slug }).from(objects).where(ilike(objects.slug, `${base}%`));
  const taken = new Set(existing.map((r) => r.slug));
  let newSlug = base;
  if (taken.has(newSlug)) {
    let i = 2;
    while (taken.has(`${base}-${i}`) && i < 100) i++;
    if (i >= 100) return;
    newSlug = `${base}-${i}`;
  }

  await db.insert(objects).values({
    slug: newSlug,
    name: `${source.name} (Clone)`,
    type: source.type,
    content: source.content as Record<string, unknown>,
    description: source.description,
    source: null,
    pluginMeta: null,
  });

  revalidatePath("/admin/objects");
  redirect(`/admin/objects/${newSlug}`);
}
