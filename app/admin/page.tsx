import { db } from "@/db";
import { articles } from "@/db/schema";
import { desc, count } from "drizzle-orm";
import Link from "next/link";

const PAGE_SIZE = 20;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageStr } = await searchParams;
  const currentPage = Math.max(1, Number(pageStr) || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const [allArticles, [{ total }]] = await Promise.all([
    db
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        summary: articles.summary,
        updatedAt: articles.updatedAt,
      })
      .from(articles)
      .orderBy(desc(articles.updatedAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(articles),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Admin</h1>
        <div className="flex items-center gap-4">
          <Link href="/admin/curriculum" className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
            Curriculum →
          </Link>
          <Link
            href="/admin/articles/new"
            className="px-4 py-2 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
          >
            New article
          </Link>
        </div>
      </div>

      {allArticles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
          <p className="text-zinc-400 dark:text-zinc-500 text-sm mb-3">
            No articles yet.
          </p>
          <Link href="/admin/articles/new" className="text-sm font-medium underline underline-offset-2">
            Write the first one →
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
            {allArticles.map((a) => (
              <div key={a.id} className="flex items-start justify-between p-4 group">
                <div>
                  <Link
                    href={`/admin/articles/${a.slug}/edit`}
                    className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-2"
                  >
                    {a.title}
                  </Link>
                  {a.summary && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-1">
                      {a.summary}
                    </p>
                  )}
                  <p className="text-xs text-zinc-300 dark:text-zinc-600 mt-1">
                    /{a.slug}
                    {a.updatedAt && (
                      <span className="ml-2">
                        updated {a.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  href={`/admin/articles/${a.slug}/edit`}
                  className="text-xs text-zinc-300 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors shrink-0 ml-4 pt-1"
                >
                  Edit →
                </Link>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              {currentPage > 1 && (
                <Link
                  href={`/admin?page=${currentPage - 1}`}
                  className="px-3 py-1.5 text-sm rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
                >
                  ← Previous
                </Link>
              )}
              <span className="text-sm text-zinc-400 dark:text-zinc-500 px-3">
                Page {currentPage} of {totalPages}
              </span>
              {currentPage < totalPages && (
                <Link
                  href={`/admin?page=${currentPage + 1}`}
                  className="px-3 py-1.5 text-sm rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
                >
                  Next →
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
