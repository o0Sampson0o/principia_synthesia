"use server";

import { db } from "@/db";
import { objects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { resolvePublisher } from "@/lib/publisher";
import { createKaoSchema, updateKaoSchema, deleteKaoSchema, createDiagramSchema, updateDiagramSchema } from "@/lib/validations";

async function assertEditRights(publisherSlug: string) {
  const session = await requireSession();
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) throw new Error("Publisher not found");
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;
  if (!(await canEditContent(session, ownerType, ownerId))) throw new Error("Forbidden");
  return { session, pub, ownerType: ownerType as "user" | "org", ownerId };
}

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

  const [row] = await db
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

  await db
    .update(objects)
    .set({
      name: parsed.data.name,
      type: parsed.data.type,
      content,
      description: parsed.data.description ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(objects.id, parsed.data.id),
        eq(objects.ownerType, ownerType),
        eq(objects.ownerId, ownerId)
      )
    );

  revalidatePath(`/${publisherSlug}/objects`);
  revalidatePath(`/${publisherSlug}/objects/${parsed.data.slug}`);
  redirect(`/${publisherSlug}/objects/${parsed.data.slug}`);
}

export async function createDiagram(publisherSlug: string, _prevState: unknown, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const raw = { ...Object.fromEntries(formData), ownerType, ownerId };
  const parsed = createDiagramSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const content = { format: parsed.data.format, source: parsed.data.source };

  const [row] = await db
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

  await db
    .update(objects)
    .set({
      name: parsed.data.name,
      type: "diagram",
      content,
      description: parsed.data.description ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(objects.id, parsed.data.id),
        eq(objects.ownerType, ownerType),
        eq(objects.ownerId, ownerId)
      )
    );

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
