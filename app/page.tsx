import Link from "next/link";
import { db } from "@/db";
import { articles, curriculumEntries } from "@/db/schema";
import { desc, asc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();

  const recent = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      summary: articles.summary,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .orderBy(desc(articles.updatedAt))
    .limit(8);

  const entries = await db
    .select({
      bookSlug: curriculumEntries.bookSlug,
      bookTitle: curriculumEntries.bookTitle,
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleSlug: articles.slug,
      articleTitle: articles.title,
      entryId: curriculumEntries.id,
    })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .orderBy(asc(curriculumEntries.bookSlug), asc(curriculumEntries.position));

  const books: Record<string, { bookTitle: string; entries: typeof entries }> = {};
  for (const e of entries) {
    if (!books[e.bookSlug]) {
      books[e.bookSlug] = { bookTitle: e.bookTitle, entries: [] };
    }
    books[e.bookSlug].entries.push(e);
  }
  const bookList = Object.entries(books);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 w-full">
      <div className="mb-14">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
          Principia Synthesia
        </h1>
        <p className="text-lg text-zinc-500 dark:text-zinc-400 max-w-xl">
          A personal textbook of everything — built one article at a time.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Books
            </h2>
            {session?.isAdmin && (
              <Link
                href="/admin/curriculum"
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                Edit curriculum →
              </Link>
            )}
          </div>
          {bookList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
              <p className="text-zinc-400 dark:text-zinc-500 text-sm mb-3">
                No books yet.
              </p>
              {session?.isAdmin && (
                <Link
                  href="/admin/curriculum"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300 underline underline-offset-2"
                >
                  Go to Curriculum editor →
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-10">
              {bookList.map(([bookSlug, book]) => (
                <div key={bookSlug}>
                  <div className="flex items-baseline justify-between mb-3">
                    <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                      {book.bookTitle}
                    </h3>
                    <Link
                      href={`/curriculum/${bookSlug}`}
                      className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    >
                      Full contents →
                    </Link>
                  </div>
                  <ol className="space-y-1">
                    {book.entries.slice(0, 6).map((e, i) => (
                      <li key={e.entryId}>
                        {e.partTitle && i === book.entries.findIndex((x) => x.partTitle === e.partTitle) && (
                          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mt-3 mb-1">
                            {e.partTitle}
                          </p>
                        )}
                        <Link
                          href={`/${e.articleSlug}`}
                          className="flex items-baseline gap-3 group"
                        >
                          <span className="text-xs text-zinc-300 dark:text-zinc-600 w-5 text-right shrink-0">
                            {e.position}
                          </span>
                          <span className="text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                            {e.articleTitle}
                          </span>
                        </Link>
                      </li>
                    ))}
                    {book.entries.length > 6 && (
                      <li className="pl-8 text-sm text-zinc-400 dark:text-zinc-500 pt-1">
                        +{book.entries.length - 6} more entries
                      </li>
                    )}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-6">
            Recently updated
          </h2>
          <ul className="space-y-4">
            {recent.map((a) => (
              <li key={a.id}>
                <Link href={`/${a.slug}`} className="group block">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-black dark:group-hover:text-white transition-colors leading-snug">
                    {a.title}
                  </p>
                  {a.summary && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-1">
                      {a.summary}
                    </p>
                  )}
                  <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-0.5">
                    {a.updatedAt?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </Link>
              </li>
            ))}
            {recent.length === 0 && (
              <li className="text-sm text-zinc-400 dark:text-zinc-500">
                No articles yet.
                {session?.isAdmin && (
                  <>
                    {" "}
                    <Link href="/admin/articles/new" className="underline underline-offset-2">
                      Write the first one →
                    </Link>
                  </>
                )}
              </li>
            )}
          </ul>

          {!session && (
            <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <Link href="/login" className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                Sign in to edit →
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
