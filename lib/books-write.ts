import { createHash } from "crypto";
import { db } from "@/db";
import { articles, books, curriculumEntries } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

/**
 * Shared write core for book structure (chapter order + part titles).
 *
 * Scope: v1 sync lets an external editor reorder chapters and change their
 * part groupings. The chapter *set* is fixed — adding/removing chapters (which
 * involves article creation, cross-publisher visibility checks, and internal-
 * article deletion) stays in the web UI. A push whose slug set differs from
 * the book's current set is rejected with a clear message.
 *
 * Concurrency mirrors articles: the caller passes the structure hash it pulled;
 * a mismatch means someone reordered remotely and the push is rejected.
 */

export interface StructureChapter {
  position: number;
  articleSlug: string;
  partTitle: string | null;
}

export class BookStructureConflictError extends Error {
  constructor(
    public remoteStructureHash: string,
    public remoteUpdatedAt: Date | null
  ) {
    super("Book structure changed since the provided base version");
    this.name = "BookStructureConflictError";
  }
}

export class BookChapterSetMismatchError extends Error {
  constructor(
    public added: string[],
    public removed: string[]
  ) {
    super("Pushed chapter set does not match the book's current chapters");
    this.name = "BookChapterSetMismatchError";
  }
}

export class BookNotFoundError extends Error {
  constructor() {
    super("Book not found");
    this.name = "BookNotFoundError";
  }
}

/**
 * Deterministic hash of a book's structure — the ordered list of
 * (articleSlug, partTitle). Order-sensitive so a pure reorder changes it.
 */
export function computeStructureHash(
  chapters: { articleSlug: string; partTitle: string | null }[]
): string {
  const canonical = JSON.stringify(
    chapters.map((c) => [c.articleSlug, c.partTitle ?? ""])
  );
  return createHash("sha256").update(canonical).digest("hex");
}

interface CurrentEntry {
  entryId: number;
  articleId: number;
  articleSlug: string;
  partTitle: string | null;
  position: number;
}

/** Loads a book's ordered chapters (non-deleted articles), or null if no such book. */
export async function loadBookStructure(
  ownerType: "user" | "org",
  ownerId: number,
  bookSlug: string
): Promise<{ bookId: number; updatedAt: Date | null; entries: CurrentEntry[] } | null> {
  const [book] = await db
    .select({ id: books.id, updatedAt: books.updatedAt })
    .from(books)
    .where(and(eq(books.slug, bookSlug), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), isNull(books.deletedAt)))
    .limit(1);
  if (!book) return null;

  const rows = await db
    .select({
      entryId: curriculumEntries.id,
      articleId: articles.id,
      articleSlug: articles.slug,
      partTitle: curriculumEntries.partTitle,
      position: curriculumEntries.position,
    })
    .from(curriculumEntries)
    .innerJoin(articles, and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt)))
    // Part dividers (articleId NULL) are excluded by the inner join and folded
    // back onto chapters below, so callers keep the legacy chapters shape.
    .where(eq(curriculumEntries.bookId, book.id))
    .orderBy(asc(curriculumEntries.position));

  return { bookId: book.id, updatedAt: book.updatedAt, entries: rows };
}

export interface UpdateBookStructureInput {
  ownerType: "user" | "org";
  ownerId: number;
  bookSlug: string;
  /** New order + part titles; slug set must equal the current book's set. */
  chapters: { articleSlug: string; partTitle: string | null }[];
  /** sha256 of the structure the caller based its edit on. Rejected on mismatch. */
  expectedStructureHash?: string;
}

export async function updateBookStructureCore(input: UpdateBookStructureInput): Promise<{
  structureHash: string;
  updatedAt: Date;
}> {
  const current = await loadBookStructure(input.ownerType, input.ownerId, input.bookSlug);
  if (!current) throw new BookNotFoundError();

  const currentHash = computeStructureHash(
    current.entries.map((e) => ({ articleSlug: e.articleSlug, partTitle: e.partTitle }))
  );
  if (input.expectedStructureHash !== undefined && input.expectedStructureHash !== currentHash) {
    throw new BookStructureConflictError(currentHash, current.updatedAt);
  }

  // The chapter set must be identical (only order/parts may change).
  const currentSlugs = new Set(current.entries.map((e) => e.articleSlug));
  const pushedSlugs = new Set(input.chapters.map((c) => c.articleSlug));
  const added = [...pushedSlugs].filter((s) => !currentSlugs.has(s));
  const removed = [...currentSlugs].filter((s) => !pushedSlugs.has(s));
  if (added.length > 0 || removed.length > 0 || input.chapters.length !== current.entries.length) {
    throw new BookChapterSetMismatchError(added, removed);
  }

  const entryBySlug = new Map(current.entries.map((e) => [e.articleSlug, e]));
  const now = new Date();

  await db.transaction(async (tx) => {
    // Dividers are rebuilt wholesale from the pushed structure: drop the
    // existing ones, then interleave a fresh divider row before each chapter
    // that starts a part. Chapter entries themselves are only repositioned.
    await tx
      .delete(curriculumEntries)
      .where(and(eq(curriculumEntries.bookId, current.bookId), isNull(curriculumEntries.articleId)));
    let pos = 0;
    for (const chapter of input.chapters) {
      const entry = entryBySlug.get(chapter.articleSlug)!;
      if (chapter.partTitle) {
        await tx.insert(curriculumEntries).values({
          bookId: current.bookId,
          articleId: null,
          position: pos++,
          partTitle: chapter.partTitle,
        });
      }
      await tx
        .update(curriculumEntries)
        .set({ position: pos++, partTitle: null })
        .where(eq(curriculumEntries.id, entry.entryId));
    }
    await tx.update(books).set({ updatedAt: now }).where(eq(books.id, current.bookId));
  });

  const structureHash = computeStructureHash(
    input.chapters.map((c) => ({ articleSlug: c.articleSlug, partTitle: c.partTitle }))
  );
  return { structureHash, updatedAt: now };
}
