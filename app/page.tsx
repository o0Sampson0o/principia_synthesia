import Link from "next/link";
import { db } from "@/db";
import { articles, curriculumEntries } from "@/db/schema";
import { desc, asc, eq, count, and, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getVisibleBookSlugs, getVisibleArticleSlugs } from "@/lib/access";

export default async function HomePage() {
  const session = await getSession();

  const [recentRaw, entries, [{ total }]] = await Promise.all([
    db
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        summary: articles.summary,
        updatedAt: articles.updatedAt,
      })
      .from(articles)
      .where(
        and(
          eq(articles.isInternal, false),
          session?.isAdmin ? undefined : sql`${articles.metadata}->>'status' = 'published'`,
        )
      )
      .orderBy(desc(articles.updatedAt))
      .limit(24),

    db
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
      .orderBy(asc(curriculumEntries.bookSlug), asc(curriculumEntries.position)),

    db.select({ total: count() }).from(articles),
  ]);

  // Filter recent articles by visibility
  const visibleRecentSlugs = await getVisibleArticleSlugs(session, recentRaw.map((a) => a.slug));
  const recent = (
    visibleRecentSlugs === "all"
      ? recentRaw
      : recentRaw.filter((a) => visibleRecentSlugs.has(a.slug))
  ).slice(0, 8);

  // Filter books by visibility
  const allBookSlugs = [...new Set(entries.map((e) => e.bookSlug))];
  const visibleBookSlugs = await getVisibleBookSlugs(session, allBookSlugs);
  const filteredEntries =
    visibleBookSlugs === "all"
      ? entries
      : entries.filter((e) => visibleBookSlugs.has(e.bookSlug));

  const books: Record<string, { bookTitle: string; entries: typeof entries }> = {};
  for (const e of filteredEntries) {
    if (!books[e.bookSlug]) books[e.bookSlug] = { bookTitle: e.bookTitle, entries: [] };
    books[e.bookSlug].entries.push(e);
  }
  const bookList = Object.entries(books);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 w-full">

      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
          Principia Synthesia
        </h1>
        <p className="text-lg text-zinc-500 dark:text-zinc-400 max-w-xl mb-6">
          A personal textbook of everything — built one article at a time.
        </p>
        {/* Stats bar */}
        <div className="flex items-center gap-6 text-sm text-zinc-400 dark:text-zinc-500">
          <span>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{total}</span>{" "}
            {total === 1 ? "article" : "articles"}
          </span>
          <span className="text-zinc-200 dark:text-zinc-700">·</span>
          <span>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{bookList.length}</span>{" "}
            {bookList.length === 1 ? "book" : "books"}
          </span>
          {session?.isAdmin && (
            <>
              <span className="text-zinc-200 dark:text-zinc-700">·</span>
              <Link
                href="/admin/articles/new"
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors underline underline-offset-2"
              >
                New article
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

        {/* Books — 2/3 width */}
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
              <p className="text-zinc-400 dark:text-zinc-500 text-sm mb-3">No books yet.</p>
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
            <div className="space-y-8">
              {bookList.map(([bookSlug, book], idx) => (
                <div key={bookSlug}>
                  {/* Divider between books */}
                  {idx > 0 && (
                    <div className="border-t border-zinc-100 dark:border-zinc-800 mb-8" />
                  )}
                  <div className="flex items-baseline justify-between mb-4">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {book.bookTitle}
                    </h3>
                    <Link
                      href={`/curriculum/${bookSlug}`}
                      className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors shrink-0 ml-4"
                    >
                      All {book.entries.length} →
                    </Link>
                  </div>
                  <ol className="space-y-2">
                    {book.entries.slice(0, 6).map((e, i) => {
                      const isFirstOfPart =
                        e.partTitle &&
                        i === book.entries.findIndex((x) => x.partTitle === e.partTitle);
                      return (
                        <li key={e.entryId}>
                          {isFirstOfPart && (
                            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mt-4 mb-2">
                              {e.partTitle}
                            </p>
                          )}
                          <Link href={`/${e.articleSlug}`} className="flex items-baseline gap-3 group py-0.5">
                            <span className="text-xs text-zinc-300 dark:text-zinc-600 w-5 text-right shrink-0 tabular-nums">
                              {e.position}
                            </span>
                            <span className="text-sm text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                              {e.articleTitle}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                    {book.entries.length > 6 && (
                      <li>
                        <Link
                          href={`/curriculum/${bookSlug}`}
                          className="flex items-baseline gap-3 group py-0.5"
                        >
                          <span className="w-5 shrink-0" />
                          <span className="text-xs text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors">
                            +{book.entries.length - 6} more entries →
                          </span>
                        </Link>
                      </li>
                    )}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar — 1/3 width */}
        <div className="space-y-10">

          {/* Recently updated */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-5">
              Recently updated
            </h2>
            <ul className="space-y-5">
              {recent.map((a) => (
                <li key={a.id}>
                  <Link href={`/${a.slug}`} className="group block">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-black dark:group-hover:text-white transition-colors leading-snug">
                      {a.title}
                    </p>
                    {a.summary && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {a.summary}
                      </p>
                    )}
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                      {a.updatedAt?.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </Link>
                </li>
              ))}
              {recent.length === 0 && (
                <li className="text-sm text-zinc-400 dark:text-zinc-500">
                  No articles yet.{" "}
                  {session?.isAdmin && (
                    <Link href="/admin/articles/new" className="underline underline-offset-2">
                      Write the first one →
                    </Link>
                  )}
                </li>
              )}
            </ul>
          </div>

          {/* Sign in prompt for visitors */}
          {!session && (
            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <Link
                href="/login"
                className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                Sign in to edit →
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
