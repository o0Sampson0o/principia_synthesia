"use server";

import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { resolvePublisher } from "@/lib/publisher";
import { parseCsv, parseJson, fetchWikidata } from "@/lib/event-import";
import { mergeEvents } from "@/lib/event-import-merge";
import { bulkImportSourceSchema } from "@/lib/validations";
import { buildRruleString } from "@/lib/recurrence";

async function assertEditRights(publisherSlug: string) {
  const session = await requireSession();
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) throw new Error("Publisher not found");
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;
  if (!(await canEditContent(session, ownerType, ownerId))) throw new Error("Forbidden");
  return { session, pub, ownerType: ownerType as "user" | "org", ownerId };
}

export interface ImportPreview {
  toInsert: number;
  toUpdate: number;
  errors: Array<{ row: number; message: string }>;
}

export interface ImportConfirm {
  inserted: number;
  updated: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const CHUNK_SIZE = 500;

export async function previewImport(
  publisherSlug: string,
  _prevState: unknown,
  formData: FormData
): Promise<ImportPreview | { error: string }> {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const rawFormat = formData.get("format");
  const parsed = bulkImportSourceSchema.safeParse({
    format: rawFormat,
    sparqlQuery: formData.get("sparqlQuery") ?? undefined,
  });
  if (!parsed.success) return { error: "Invalid format selection" };

  const { format } = parsed.data;

  let parseResult;

  if (format === "wikidata") {
    if (!parsed.data.sparqlQuery) return { error: "SPARQL query is required for Wikidata import" };
    parseResult = await fetchWikidata({
      sparqlQuery: parsed.data.sparqlQuery,
      publisherSlug,
    });
  } else {
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "No file uploaded" };
    if (file.size > MAX_FILE_SIZE) return { error: "File must be 5 MB or smaller" };

    const content = await file.text();
    parseResult = format === "csv" ? parseCsv(content) : parseJson(content);
  }

  const existing = await db
    .select({ ownerType: events.ownerType, ownerId: events.ownerId, slug: events.slug })
    .from(events)
    .where(and(eq(events.ownerType, ownerType), eq(events.ownerId, ownerId)));

  const merged = mergeEvents(parseResult.valid.map((r) => r.data), existing, ownerType, ownerId);

  return {
    toInsert: merged.toInsert.length,
    toUpdate: merged.toUpdate.length,
    errors: parseResult.errors,
  };
}

export async function confirmImport(
  publisherSlug: string,
  _prevState: unknown,
  formData: FormData
): Promise<ImportConfirm | { error: string }> {
  const { ownerType, ownerId } = await assertEditRights(publisherSlug);

  const rawFormat = formData.get("format");
  const parsed = bulkImportSourceSchema.safeParse({
    format: rawFormat,
    sparqlQuery: formData.get("sparqlQuery") ?? undefined,
  });
  if (!parsed.success) return { error: "Invalid format selection" };

  const { format } = parsed.data;

  let parseResult;

  if (format === "wikidata") {
    if (!parsed.data.sparqlQuery) return { error: "SPARQL query is required for Wikidata import" };
    parseResult = await fetchWikidata({
      sparqlQuery: parsed.data.sparqlQuery,
      publisherSlug,
    });
  } else {
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "No file uploaded" };
    if (file.size > MAX_FILE_SIZE) return { error: "File must be 5 MB or smaller" };

    const content = await file.text();
    parseResult = format === "csv" ? parseCsv(content) : parseJson(content);
  }

  const validEvents = parseResult.valid.map((r) => r.data);
  const existing = await db
    .select({ ownerType: events.ownerType, ownerId: events.ownerId, slug: events.slug })
    .from(events)
    .where(and(eq(events.ownerType, ownerType), eq(events.ownerId, ownerId)));

  const merged = mergeEvents(validEvents, existing, ownerType, ownerId);

  let inserted = 0;
  let updated = 0;

  const toInsert = merged.toInsert.map((e) => ({
    slug: e.slug,
    title: e.title,
    description: e.description ?? null,
    eventDate: new Date(e.eventDate),
    category: e.category ?? null,
    isEraStart: e.isEraStart,
    isEraEnd: e.isEraEnd,
    eraName: e.eraName ?? null,
    recurrenceRule: e.recurrenceFrequency && e.recurrenceFrequency !== "none"
      ? buildRruleString(e.recurrenceFrequency, e.recurrenceCount, e.recurrenceUntil)
      : null,
    ownerType,
    ownerId,
  }));

  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const insertedRows = await db
      .insert(events)
      .values(chunk)
      .onConflictDoNothing({ target: [events.ownerType, events.ownerId, events.slug] })
      .returning({ id: events.id });
    inserted += insertedRows.length;
  }

  for (const e of merged.toUpdate) {
    await db
      .update(events)
      .set({
        title: e.title,
        description: e.description ?? null,
        eventDate: new Date(e.eventDate),
        category: e.category ?? null,
        isEraStart: e.isEraStart,
        isEraEnd: e.isEraEnd,
        eraName: e.eraName ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(events.ownerType, ownerType),
          eq(events.ownerId, ownerId),
          eq(events.slug, e.slug)
        )
      );
    updated++;
  }

  revalidatePath("/timeline");
  revalidatePath(`/${publisherSlug}/events`);
  revalidateTag("timeline", "default");

  return { inserted, updated };
}
