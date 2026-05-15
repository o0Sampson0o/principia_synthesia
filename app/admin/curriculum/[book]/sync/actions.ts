"use server";

import JSZip from "jszip";
import { db } from "@/db";
import { articles, curriculumEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { syncBundleManifestSchema } from "@/lib/validations";

const MAX_ZIP_BYTES = 25 * 1024 * 1024; // 25 MB

export type SyncImportSkip = {
  slug: string;
  reason: "unknown-slug" | "missing-mdx-file" | "db-newer";
};

export type SyncImportResult =
  | { ok: false; error: string }
  | {
      ok: true;
      updated: string[];
      skipped: SyncImportSkip[];
    };

/**
 * Imports a sync bundle zip for the given book. The bookSlug is bound by the
 * page via `.bind(null, bookSlug)` so it is trusted (not user-supplied via form).
 *
 * Merge logic: last-write-wins per chapter based on `updatedAt`.
 * - If zip's updatedAt >= DB's updatedAt: update the article content.
 * - If DB's updatedAt is newer: skip with reason "db-newer".
 * - If the slug is not found in DB entries for the book: skip with "unknown-slug".
 * - If the .mdx file is missing from the zip: skip with "missing-mdx-file".
 *
 * Note: articles.updatedAt may be null (though defaultNow() is set). A null DB
 * timestamp is treated as epoch 0, meaning any zip with a valid updatedAt wins.
 * This is intentional — a missing DB timestamp should not permanently block imports.
 *
 * No revision row is created on merge (following updateArticleContent() precedent).
 */
export async function importSyncBundle(
  bookSlug: string,
  _prevState: SyncImportResult | null,
  formData: FormData
): Promise<SyncImportResult> {
  const session = await getSession();
  if (!session?.isAdmin) {
    return { ok: false, error: "Unauthorized" };
  }

  const file = formData.get("bundle");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file uploaded" };
  }
  if (file.size > MAX_ZIP_BYTES) {
    return { ok: false, error: `File too large (max ${MAX_ZIP_BYTES} bytes)` };
  }

  // Parse zip
  let zip: JSZip;
  try {
    const buf = await file.arrayBuffer();
    zip = await JSZip.loadAsync(buf);
  } catch {
    return { ok: false, error: "Invalid zip file" };
  }

  // Read book.json
  const manifestFile = zip.file("book.json");
  if (!manifestFile) {
    return { ok: false, error: "book.json not found in zip" };
  }
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(await manifestFile.async("string"));
  } catch {
    return { ok: false, error: "book.json is not valid JSON" };
  }

  const parsed = syncBundleManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    return { ok: false, error: "book.json failed validation: " + parsed.error.issues[0].message };
  }
  const manifest = parsed.data;

  // bookSlug guard: trusted URL slug vs untrusted zip slug
  if (manifest.bookSlug !== bookSlug) {
    return {
      ok: false,
      error: `bookSlug mismatch: zip is for "${manifest.bookSlug}", URL is for "${bookSlug}"`,
    };
  }

  // Load DB state for this book (all articles linked via curriculumEntries)
  const dbRows = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      isInternal: articles.isInternal,
      parentBookSlug: articles.parentBookSlug,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .innerJoin(curriculumEntries, eq(curriculumEntries.articleId, articles.id))
    .where(eq(curriculumEntries.bookSlug, bookSlug))
    .orderBy(asc(curriculumEntries.position));

  const dbBySlug = new Map(dbRows.map((r) => [r.slug, r]));

  const updated: string[] = [];
  const skipped: SyncImportSkip[] = [];

  for (const ch of manifest.chapters) {
    const dbRow = dbBySlug.get(ch.slug);
    if (!dbRow) {
      skipped.push({ slug: ch.slug, reason: "unknown-slug" });
      continue;
    }

    const mdxFile = zip.file(`chapters/${ch.slug}.mdx`);
    if (!mdxFile) {
      skipped.push({ slug: ch.slug, reason: "missing-mdx-file" });
      continue;
    }

    // last-write-wins: skip if DB is strictly newer
    const zipUpdated = new Date(ch.updatedAt).getTime();
    const dbUpdated = dbRow.updatedAt?.getTime() ?? 0;
    if (zipUpdated < dbUpdated) {
      skipped.push({ slug: ch.slug, reason: "db-newer" });
      continue;
    }

    const content = await mdxFile.async("string");

    // Update only content + updatedAt; never touch slug, title, isInternal, parentBookSlug
    await db
      .update(articles)
      .set({ content, updatedAt: new Date() })
      .where(eq(articles.id, dbRow.id));

    updated.push(ch.slug);

    // Revalidate the correct public path based on article type
    if (dbRow.isInternal && dbRow.parentBookSlug) {
      revalidatePath(`/curriculum/${dbRow.parentBookSlug}/${ch.slug}`);
    } else {
      revalidatePath(`/${ch.slug}`);
    }
    revalidatePath(`/admin/articles/${ch.slug}/edit`);
  }

  if (updated.length > 0) {
    revalidatePath(`/curriculum/${bookSlug}`);
  }
  revalidatePath(`/admin/curriculum/${bookSlug}/sync`);

  return { ok: true, updated, skipped };
}
