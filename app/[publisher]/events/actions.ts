"use server";

import { db } from "@/db";
import { events, eventArticles, articles } from "@/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { assertEditRights } from "@/app/[publisher]/articles/actions";
import {
  createEventSchema,
  updateEventSchema,
  deleteEventSchema,
} from "@/lib/validations";
import { buildRruleString } from "@/lib/recurrence";

async function setEventArticleLinks(
  eventId: number,
  slugs: string[],
  ownerType: "user" | "org",
  ownerId: number
) {
  await db.delete(eventArticles).where(eq(eventArticles.eventId, eventId));

  if (slugs.length === 0) return;

  const linkedArticles = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        inArray(articles.slug, slugs),
        isNull(articles.deletedAt)
      )
    );

  if (linkedArticles.length === 0) return;

  await db.insert(eventArticles).values(
    linkedArticles.map((a) => ({ eventId, articleId: a.id }))
  );
}

export async function createEvent(
  publisherSlug: string,
  _prevState: unknown,
  formData: FormData
) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const parsed = createEventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const freq = parsed.data.recurrenceFrequency ?? "none";
  const recurrenceRule = buildRruleString(
    freq,
    parsed.data.recurrenceCount,
    parsed.data.recurrenceUntil ? new Date(parsed.data.recurrenceUntil) : undefined
  );

  const [row] = await db
    .insert(events)
    .values({
      slug: parsed.data.slug,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      eventDate: new Date(parsed.data.eventDate),
      category: parsed.data.category ?? null,
      isEraStart: parsed.data.isEraStart,
      isEraEnd: parsed.data.isEraEnd,
      eraName: parsed.data.eraName?.trim() || null,
      recurrenceRule,
      recurrenceUntil: parsed.data.recurrenceUntil ? new Date(parsed.data.recurrenceUntil) : null,
      ownerType,
      ownerId,
    })
    .returning({ id: events.id, slug: events.slug });

  const slugs = (parsed.data.relatedArticleSlugs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await setEventArticleLinks(row.id, slugs, ownerType, ownerId);

  revalidatePath("/");
  revalidatePath(`/${publisherSlug}`);
  revalidatePath(`/${publisherSlug}/events`);
  revalidatePath("/timeline");
  revalidateTag("timeline", "default");
  redirect(`/${publisherSlug}/events/${row.slug}`);
}

export async function updateEvent(
  publisherSlug: string,
  _prevState: unknown,
  formData: FormData
): Promise<{ errors: Partial<Record<string, string[]>> } | void> {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const parsed = updateEventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const updateFreq = parsed.data.recurrenceFrequency ?? "none";
  const updateRecurrenceRule = buildRruleString(
    updateFreq,
    parsed.data.recurrenceCount,
    parsed.data.recurrenceUntil ? new Date(parsed.data.recurrenceUntil) : undefined
  );

  const [existingEvent] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, parsed.data.id), eq(events.ownerType, ownerType), eq(events.ownerId, ownerId)))
    .limit(1);
  if (!existingEvent) return { errors: { id: ["Event not found"] } };

  await db
    .update(events)
    .set({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      eventDate: new Date(parsed.data.eventDate),
      category: parsed.data.category ?? null,
      isEraStart: parsed.data.isEraStart,
      isEraEnd: parsed.data.isEraEnd,
      eraName: parsed.data.eraName?.trim() || null,
      recurrenceRule: updateRecurrenceRule,
      recurrenceUntil: parsed.data.recurrenceUntil ? new Date(parsed.data.recurrenceUntil) : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(events.id, parsed.data.id),
        eq(events.ownerType, ownerType),
        eq(events.ownerId, ownerId)
      )
    );

  const slugs = (parsed.data.relatedArticleSlugs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await setEventArticleLinks(parsed.data.id, slugs, ownerType, ownerId);

  revalidatePath("/");
  revalidatePath(`/${publisherSlug}`);
  revalidatePath(`/${publisherSlug}/events`);
  revalidatePath(`/${publisherSlug}/events/${parsed.data.slug}`);
  revalidatePath("/timeline");
  revalidateTag("timeline", "default");
  redirect(`/${publisherSlug}/events/${parsed.data.slug}`);
}

export async function deleteEvent(publisherSlug: string, formData: FormData) {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const parsed = deleteEventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await db
    .delete(events)
    .where(
      and(
        eq(events.id, parsed.data.id),
        eq(events.ownerType, ownerType),
        eq(events.ownerId, ownerId)
      )
    );

  revalidatePath("/");
  revalidatePath(`/${publisherSlug}`);
  revalidatePath(`/${publisherSlug}/events`);
  revalidatePath("/timeline");
  revalidateTag("timeline", "default");
  redirect(`/${publisherSlug}/events`);
}
