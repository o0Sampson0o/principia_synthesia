import { createHash } from "crypto";
import { db } from "@/db";
import { articles, books, curriculumEntries } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { withDividerTitles } from "@/lib/curriculum";

/**
 * Shared write core for book structure (section order + Part/Chapter labels).
 *
 * Scope: v1 sync lets an external editor reorder sections and change their
 * Part/Chapter groupings. The section *set* is fixed — adding/removing sections
 * (which involves article creation, cross-publisher visibility checks, and
 * internal-article deletion) stays in the web UI. A push whose slug set differs
 * from the book's current set is rejected with a clear message.
 *
 * Concurrency mirrors articles: the caller passes the structure hash it pulled;
 * a mismatch means someone reordered remotely and the push is rejected.
 */

export interface StructureSection {
  position: number;
  articleSlug: string;
  partTitle: string | null;
  chapterTitle: string | null;
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

export class BookSectionSetMismatchError extends Error {
  constructor(
    public added: string[],
    public removed: string[]
  ) {
    super("Pushed section set does not match the book's current sections");
    this.name = "BookSectionSetMismatchError";
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
 * (articleSlug, partTitle, chapterTitle). Order-sensitive so a pure reorder
 * changes it.
 */
export function computeStructureHash(
  sections: { articleSlug: string; partTitle: string | null; chapterTitle: string | null }[]
): string {
  const canonical = JSON.stringify(
    sections.map((s) => [s.articleSlug, s.partTitle ?? "", s.chapterTitle ?? ""])
  );
  return createHash("sha256").update(canonical).digest("hex");
}

interface CurrentEntry {
  entryId: number;
  articleId: number;
  articleSlug: string;
  partTitle: string | null;
  chapterTitle: string | null;
  position: number;
}

/**
 * Loads a book's ordered sections (non-deleted articles), each carrying the
 * folded Part/Chapter label that starts its group. Returns null if no such book.
 */
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
    // Divider rows (articleId NULL) are excluded by the inner join and folded
    // back onto sections below, so callers get the Part/Chapter labels inline.
    .where(eq(curriculumEntries.bookId, book.id))
    .orderBy(asc(curriculumEntries.position));

  const entries = await withDividerTitles(
    rows.map((r) => ({ ...r, chapterTitle: null as string | null })),
    book.id
  );
  return { bookId: book.id, updatedAt: book.updatedAt, entries };
}

export interface UpdateBookStructureInput {
  ownerType: "user" | "org";
  ownerId: number;
  bookSlug: string;
  /** New order + Part/Chapter labels; slug set must equal the current book's set. */
  sections: { articleSlug: string; partTitle: string | null; chapterTitle: string | null }[];
  /** sha256 of the structure the caller based its edit on. Rejected on mismatch. */
  expectedStructureHash?: string;
}

export async function updateBookStructureCore(input: UpdateBookStructureInput): Promise<{
  structureHash: string;
  updatedAt: Date;
}> {
  const current = await loadBookStructure(input.ownerType, input.ownerId, input.bookSlug);
  if (!current) throw new BookNotFoundError();

  const currentHash = computeStructureHash(current.entries);
  if (input.expectedStructureHash !== undefined && input.expectedStructureHash !== currentHash) {
    throw new BookStructureConflictError(currentHash, current.updatedAt);
  }

  // The section set must be identical (only order/labels may change).
  const currentSlugs = new Set(current.entries.map((e) => e.articleSlug));
  const pushedSlugs = new Set(input.sections.map((s) => s.articleSlug));
  const added = [...pushedSlugs].filter((s) => !currentSlugs.has(s));
  const removed = [...currentSlugs].filter((s) => !pushedSlugs.has(s));
  if (added.length > 0 || removed.length > 0 || input.sections.length !== current.entries.length) {
    throw new BookSectionSetMismatchError(added, removed);
  }

  const entryBySlug = new Map(current.entries.map((e) => [e.articleSlug, e]));
  const now = new Date();

  await db.transaction(async (tx) => {
    // Dividers are rebuilt wholesale from the pushed structure: drop the
    // existing ones, then interleave a fresh divider row before each section
    // that starts a Part and/or a Chapter (Part first). Section entries
    // themselves are only repositioned.
    await tx
      .delete(curriculumEntries)
      .where(and(eq(curriculumEntries.bookId, current.bookId), isNull(curriculumEntries.articleId)));
    let pos = 0;
    for (const section of input.sections) {
      const entry = entryBySlug.get(section.articleSlug)!;
      if (section.partTitle) {
        await tx.insert(curriculumEntries).values({
          bookId: current.bookId,
          articleId: null,
          position: pos++,
          partTitle: section.partTitle,
          dividerLevel: "part",
        });
      }
      if (section.chapterTitle) {
        await tx.insert(curriculumEntries).values({
          bookId: current.bookId,
          articleId: null,
          position: pos++,
          partTitle: section.chapterTitle,
          dividerLevel: "chapter",
        });
      }
      await tx
        .update(curriculumEntries)
        .set({ position: pos++, partTitle: null })
        .where(eq(curriculumEntries.id, entry.entryId));
    }
    await tx.update(books).set({ updatedAt: now }).where(eq(books.id, current.bookId));
  });

  const structureHash = computeStructureHash(input.sections);
  return { structureHash, updatedAt: now };
}
