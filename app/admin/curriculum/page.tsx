import { db } from "@/db";
import { articles, curriculumEntries, resourceVisibility } from "@/db/schema";
import { asc, eq, and, inArray } from "drizzle-orm";
import Link from "next/link";
import { removeCurriculumEntry } from "@/app/admin/actions";
import DeleteBookButton from "./DeleteBookButton";
import AddEntryForm from "./AddEntryForm";
import CreateInternalArticleForm from "./CreateInternalArticleForm";

export default async function AdminCurriculumPage() {
  const allArticles = await db
    .select({ id: articles.id, slug: articles.slug, title: articles.title, isInternal: articles.isInternal })
    .from(articles)
    .where(eq(articles.isInternal, false))
    .orderBy(asc(articles.title));

  const entries = await db
    .select({
      id: curriculumEntries.id,
      bookSlug: curriculumEntries.bookSlug,
      bookTitle: curriculumEntries.bookTitle,
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleId: curriculumEntries.articleId,
      articleSlug: articles.slug,
      articleTitle: articles.title,
      isInternal: articles.isInternal,
    })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .orderBy(asc(curriculumEntries.bookSlug), asc(curriculumEntries.position));

  const books: Record<string, { bookTitle: string; entries: typeof entries }> = {};
  for (const e of entries) {
    if (!books[e.bookSlug]) books[e.bookSlug] = { bookTitle: e.bookTitle, entries: [] };
    books[e.bookSlug].entries.push(e);
  }
  const bookList = Object.entries(books);

  // Fetch visibility state for all books
  const visibilityRows =
    bookList.length > 0
      ? await db
          .select({ resourceKey: resourceVisibility.resourceKey, isPrivate: resourceVisibility.isPrivate })
          .from(resourceVisibility)
          .where(
            and(
              eq(resourceVisibility.resourceType, "book"),
              inArray(resourceVisibility.resourceKey, bookList.map(([s]) => s))
            )
          )
      : [];
  const privateMap = new Map(visibilityRows.map((r) => [r.resourceKey, r.isPrivate]));

  const existingArticleIds = new Set(entries.map((e) => e.articleId));

  const nextPositions: Record<string, number> = {};
  for (const [slug, book] of bookList) {
    nextPositions[slug] = Math.max(...book.entries.map((e) => e.position), 0) + 1;
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Curriculum</h1>
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
          ← Back to home
        </Link>
      </div>

      {/* Add entry form */}
      <AddEntryForm
        allArticles={allArticles}
        bookList={bookList}
        existingArticleIds={Array.from(existingArticleIds)}
        nextPositions={nextPositions}
      />

      {/* Existing books */}
      {bookList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
          <p className="text-zinc-400 dark:text-zinc-500 text-sm">
            No books yet. Use the form above to start building a curriculum.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {bookList.map(([bookSlug, book]) => (
            <div key={bookSlug}>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-lg font-semibold flex items-baseline gap-2">
                  {book.bookTitle}{" "}
                  <span className="text-xs font-normal text-zinc-400">
                    ({bookSlug})
                  </span>
                  {privateMap.get(bookSlug) === true && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                      Private
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/curriculum/${bookSlug}/access`}
                    className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    aria-label={`Manage access for ${book.bookTitle}`}
                  >
                    [Lock] Access
                  </Link>
                  <DeleteBookButton bookSlug={bookSlug} bookTitle={book.bookTitle} />
                </div>
              </div>
              <ol className="space-y-1">
                {book.entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-1 group">
                    <div className="flex items-baseline gap-3">
                      <span className="text-xs text-zinc-300 dark:text-zinc-600 w-5 text-right shrink-0 tabular-nums">
                        {e.position}
                      </span>
                      <Link
                        href={e.isInternal ? `/curriculum/${e.bookSlug}/${e.articleSlug}` : `/${e.articleSlug}`}
                        className="text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                      >
                        {e.articleTitle}
                      </Link>
                      {e.isInternal && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                          Sub-page
                        </span>
                      )}
                      {e.partTitle && (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          — {e.partTitle}
                        </span>
                      )}
                    </div>
                    <form action={removeCurriculumEntry}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="bookSlug" value={e.bookSlug} />
                      <button
                        type="submit"
                        className="text-xs text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ol>
              <CreateInternalArticleForm
                bookSlug={bookSlug}
                bookTitle={book.bookTitle}
                nextPosition={nextPositions[bookSlug]}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
