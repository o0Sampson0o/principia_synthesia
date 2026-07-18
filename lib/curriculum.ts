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
 * Stamps standalone divider rows (curriculum entries with a NULL articleId)
 * onto the first section that follows them, reproducing the "label on the
 * section that starts the group" shape for BOTH hierarchy levels:
 *   - a `dividerLevel: 'part'` row  → `partTitle` on the following section
 *   - a `dividerLevel: 'chapter'` row → `chapterTitle` on the following section
 *
 * Exports, snapshots, the /api/v1 structure contract and the ps-sync CLI all
 * speak this folded shape, so the Part › Chapter › Section hierarchy survives
 * those surfaces without any of them knowing divider rows exist.
 *
 * Section rows keep any pre-existing partTitle when no divider precedes them,
 * so pre-migration data renders unchanged.
 */
export async function withDividerTitles<
  T extends { position: number; partTitle: string | null; chapterTitle: string | null },
>(sections: T[], bookId: number): Promise<T[]> {
  const dividers = await db
    .select({
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      dividerLevel: curriculumEntries.dividerLevel,
    })
    .from(curriculumEntries)
    .where(and(eq(curriculumEntries.bookId, bookId), isNull(curriculumEntries.articleId)))
    .orderBy(asc(curriculumEntries.position));
  if (dividers.length === 0) return sections;

  const out = [...sections].sort((a, b) => a.position - b.position).map((s) => ({ ...s }));
  for (const d of dividers) {
    if (!d.partTitle) continue;
    const next = out.find((s) => s.position > d.position);
    if (!next) continue;
    // Legacy divider rows (pre-0022) have a NULL dividerLevel — treat as 'part'.
    if (d.dividerLevel === "chapter") next.chapterTitle = d.partTitle;
    else next.partTitle = d.partTitle;
  }
  return out;
}
