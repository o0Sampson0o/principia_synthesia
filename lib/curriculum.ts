import { db } from "@/db";
import { articles, books, curriculumEntries } from "@/db/schema";
import { and, asc, eq, isNotNull, isNull, notExists, sql } from "drizzle-orm";

/**
 * SQL condition: the article's parent book, if it has one, is not sitting in
 * the bin. Internal articles are only reachable through their book, so while
 * the book is soft-deleted its chapters must be invisible everywhere — the
 * sync API included — or "binned" and "gone" stop meaning the same thing.
 * Articles with no parent book always pass.
 */
export function parentBookNotBinned() {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(books)
      .where(and(eq(books.id, articles.parentBookId), isNotNull(books.deletedAt)))
  );
}

/**
 * Stamps standalone part-divider rows (curriculum entries with a NULL
 * articleId) onto the first chapter that follows them, reproducing the legacy
 * "partTitle on the chapter that starts the part" shape. Exports, snapshots,
 * the /api/v1 structure contract and the ps-sync CLI all still speak that
 * shape, so parts survive those surfaces without any of them knowing divider
 * rows exist.
 *
 * Chapter rows keep their own partTitle when no divider precedes them, so
 * pre-migration data renders unchanged.
 */
export async function withPartTitles<T extends { position: number; partTitle: string | null }>(
  chapters: T[],
  bookId: number
): Promise<T[]> {
  const dividers = await db
    .select({ position: curriculumEntries.position, partTitle: curriculumEntries.partTitle })
    .from(curriculumEntries)
    .where(and(eq(curriculumEntries.bookId, bookId), isNull(curriculumEntries.articleId)))
    .orderBy(asc(curriculumEntries.position));
  if (dividers.length === 0) return chapters;

  const out = [...chapters].sort((a, b) => a.position - b.position).map((c) => ({ ...c }));
  for (const d of dividers) {
    if (!d.partTitle) continue;
    const next = out.find((c) => c.position > d.position);
    if (next) next.partTitle = d.partTitle;
  }
  return out;
}
