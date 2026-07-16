import { db } from "@/db";
import { curriculumEntries } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

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
