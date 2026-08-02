"use server";

import { db } from "@/db";
import { isUniqueViolation } from "@/lib/db-errors";
import { objects } from "@/db/schema";
import { normalizeAnimationHeight } from "@/lib/animation-dimensions";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertEditRights } from "@/app/[publisher]/articles/actions";
import { createKaoSchema, updateKaoSchema, deleteKaoSchema, createDiagramSchema, updateDiagramSchema } from "@/lib/validations";

export async function createKaoObject(publisherSlug: string, _prevState: unknown, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const raw = { ...Object.fromEntries(formData), ownerType, ownerId };
  const parsed = createKaoSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  let content: unknown;
  try {
    content = JSON.parse(parsed.data.content);
  } catch {
    return { errors: { content: ["Invalid JSON"] } };
  }

  let row;
  try {
    [row] = await db
      .insert(objects)
      .values({
        slug: parsed.data.slug,
        name: parsed.data.name,
        type: parsed.data.type,
        content,
        description: parsed.data.description ?? null,
        ownerType,
        ownerId,
      })
      .returning({ slug: objects.slug });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { errors: { slug: ["An object with this slug already exists"] } };
    }
    throw err;
  }

  revalidatePath(`/${publisherSlug}`);
  revalidatePath(`/${publisherSlug}/objects`);
  redirect(`/${publisherSlug}/objects/${row.slug}`);
}

export async function updateKaoObject(
  publisherSlug: string,
  _prevState: unknown,
  formData: FormData
): Promise<{ errors: Partial<Record<string, string[]>> } | void> {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const raw = { ...Object.fromEntries(formData), ownerType, ownerId };
  const parsed = updateKaoSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  let content: unknown;
  try {
    content = JSON.parse(parsed.data.content);
  } catch {
    return { errors: { content: ["Invalid JSON"] } };
  }

  try {
    await db
      .update(objects)
      .set({
        name: parsed.data.name,
        type: parsed.data.type,
        content,
        description: parsed.data.description ?? null,
        slug: parsed.data.slug,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(objects.id, parsed.data.id),
          eq(objects.ownerType, ownerType),
          eq(objects.ownerId, ownerId)
        )
      );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { errors: { slug: ["An object with this slug already exists"] } };
    }
    throw err;
  }

  revalidatePath(`/${publisherSlug}/objects`);
  revalidatePath(`/${publisherSlug}/objects/${parsed.data.slug}`);
  redirect(`/${publisherSlug}/objects/${parsed.data.slug}`);
}

/**
 * Animation-specific update: like updateKaoObject but RETURNS the result instead
 * of redirecting, so the CodeMirror animation editor can stay on the page and
 * refresh its preview after saving. Also updates the slug (rename).
 */
export async function updateAnimationObject(
  publisherSlug: string,
  _prevState: unknown,
  formData: FormData
): Promise<{ ok: true; slug: string } | { errors: Partial<Record<string, string[]>> }> {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const raw = { ...Object.fromEntries(formData), ownerType, ownerId };
  const parsed = updateKaoSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  let content: unknown;
  try {
    content = JSON.parse(parsed.data.content);
  } catch {
    return { errors: { content: ["Invalid JSON"] } };
  }

  // The frame height reaches the DOM as a CSS length and the bundle export as an
  // attribute, so clamp it here rather than trusting the submitted JSON.
  if (content && typeof content === "object") {
    content = {
      ...content,
      height: normalizeAnimationHeight((content as { height?: unknown }).height),
    };
  }

  try {
    await db
      .update(objects)
      .set({
        name: parsed.data.name,
        type: parsed.data.type,
        content,
        description: parsed.data.description ?? null,
        slug: parsed.data.slug,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(objects.id, parsed.data.id),
          eq(objects.ownerType, ownerType),
          eq(objects.ownerId, ownerId)
        )
      );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { errors: { slug: ["An object with this slug already exists"] } };
    }
    throw err;
  }

  revalidatePath(`/${publisherSlug}/objects`);
  revalidatePath(`/${publisherSlug}/objects/${parsed.data.slug}`);
  return { ok: true, slug: parsed.data.slug };
}

export async function createDiagram(publisherSlug: string, _prevState: unknown, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const raw = { ...Object.fromEntries(formData), ownerType, ownerId };
  const parsed = createDiagramSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const content = { format: parsed.data.format, source: parsed.data.source };

  let row;
  try {
    [row] = await db
      .insert(objects)
      .values({
        slug: parsed.data.slug,
        name: parsed.data.name,
        type: "diagram",
        content,
        description: parsed.data.description ?? null,
        ownerType,
        ownerId,
      })
      .returning({ slug: objects.slug });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { errors: { slug: ["An object with this slug already exists"] } };
    }
    throw err;
  }

  revalidatePath(`/${publisherSlug}`);
  revalidatePath(`/${publisherSlug}/objects`);
  redirect(`/${publisherSlug}/objects/${row.slug}`);
}

export async function updateDiagram(
  publisherSlug: string,
  _prevState: unknown,
  formData: FormData
): Promise<{ errors: Partial<Record<string, string[]>> } | void> {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const raw = { ...Object.fromEntries(formData), ownerType, ownerId };
  const parsed = updateDiagramSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const content = { format: parsed.data.format, source: parsed.data.source };

  try {
    await db
      .update(objects)
      .set({
        name: parsed.data.name,
        type: "diagram",
        content,
        description: parsed.data.description ?? null,
        slug: parsed.data.slug,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(objects.id, parsed.data.id),
          eq(objects.ownerType, ownerType),
          eq(objects.ownerId, ownerId)
        )
      );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { errors: { slug: ["An object with this slug already exists"] } };
    }
    throw err;
  }

  revalidatePath(`/${publisherSlug}/objects`);
  revalidatePath(`/${publisherSlug}/objects/${parsed.data.slug}`);
  redirect(`/${publisherSlug}/objects/${parsed.data.slug}`);
}

export async function deleteKaoObject(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const parsed = deleteKaoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await db
    .delete(objects)
    .where(
      and(
        eq(objects.id, parsed.data.id),
        eq(objects.ownerType, ownerType),
        eq(objects.ownerId, ownerId)
      )
    );

  revalidatePath(`/${publisherSlug}/objects`);
  redirect(`/${publisherSlug}/objects`);
}
