import { db } from "@/db";
import { articles, books } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * The parent book's KaTeX macro definitions, for a genuinely internal section.
 *
 * Mirrors the published book route: a standalone article that a book merely
 * links to also renders at its own URL, where the book's macros do not exist,
 * so it must not inherit them in the editor either. Only `isInternal` sections
 * — which have no page outside the book — qualify.
 *
 * Shared by the Preview server action and the edit page (which hands it to the
 * LIVE tab), so all three surfaces apply one rule rather than three.
 */
export async function bookMacrosForArticle(articleId: number): Promise<string | null> {
  const [row] = await db
    .select({ macros: books.metadata })
    .from(articles)
    .innerJoin(books, eq(books.id, articles.parentBookId))
    .where(and(eq(articles.id, articleId), eq(articles.isInternal, true), isNull(books.deletedAt)))
    .limit(1);
  return row?.macros.macros ?? null;
}
