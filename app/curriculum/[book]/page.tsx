import { db } from "@/db";
import { articles, curriculumEntries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canViewBook } from "@/lib/access";

export default async function CurriculumBookPage({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book: bookSlug } = await params;

  const entries = await db
    .select({
      id: curriculumEntries.id,
      bookTitle: curriculumEntries.bookTitle,
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      articleSlug: articles.slug,
      articleTitle: articles.title,
      summary: articles.summary,
    })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(eq(curriculumEntries.bookSlug, bookSlug))
    .orderBy(asc(curriculumEntries.position));

  if (entries.length === 0) notFound();

  const session = await getSession();
  if (!(await canViewBook(bookSlug, session))) notFound();

  const bookTitle = entries[0].bookTitle;

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link
        href="/"
        className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mb-6 inline-block"
      >
        ← Back to home
      </Link>

      <h1 className="text-4xl font-bold mb-2 text-zinc-900 dark:text-zinc-100">
        {bookTitle}
      </h1>
      <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-10">
        {entries.length} articles
      </p>

      <ol className="space-y-1">
        {entries.map((e) => (
          <li key={e.id}>
            {e.partTitle && (
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mt-6 mb-2">
                {e.partTitle}
              </p>
            )}
               <Link href={`/curriculum/${bookSlug}/${e.articleSlug}`} className="group flex items-baseline gap-3 py-1">
              <span className="text-xs text-zinc-300 dark:text-zinc-600 w-6 text-right shrink-0 tabular-nums">
                {e.position}
              </span>
              <div>
                <span className="text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors font-medium">
                  {e.articleTitle}
                </span>
                {e.summary && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-1">
                    {e.summary}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-12 pt-6 border-t border-zinc-200 dark:border-zinc-800 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <a
            href={`/api/curriculum/${bookSlug}/export/pdf`}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            ↓ Download PDF
          </a>
          <a
            href={`/api/curriculum/${bookSlug}/export/epub`}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            ↓ Download EPUB
          </a>
        </div>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          <Link href={`/admin/articles/new`} className="underline underline-offset-2">
            Add a new article
          </Link>
          {" "}or{" "}
          <Link href={`/admin/curriculum`} className="underline underline-offset-2">
            edit this curriculum
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
