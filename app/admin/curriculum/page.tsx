import { db } from "@/db";
import { articles, curriculumEntries } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { upsertCurriculumEntry, removeCurriculumEntry } from "@/app/admin/actions";
import AddEntryForm from "./AddEntryForm";

export default async function AdminCurriculumPage() {
  const allArticles = await db
    .select({ id: articles.id, slug: articles.slug, title: articles.title })
    .from(articles)
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
                <h3 className="text-lg font-semibold">
                  {book.bookTitle}{" "}
                  <span className="text-xs font-normal text-zinc-400">
                    ({bookSlug})
                  </span>
                </h3>
              </div>
              <ol className="space-y-1">
                {book.entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-1 group">
                    <div className="flex items-baseline gap-3">
                      <span className="text-xs text-zinc-300 dark:text-zinc-600 w-5 text-right shrink-0 tabular-nums">
                        {e.position}
                      </span>
                      <Link
                        href={`/${e.articleSlug}`}
                        className="text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                      >
                        {e.articleTitle}
                      </Link>
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
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
