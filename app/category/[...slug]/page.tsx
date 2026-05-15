import { db } from "@/db";
import { categories, articleCategories, articles, curriculumEntries } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import ArticleCard from "@/components/ArticleCard";
import { getSession } from "@/lib/auth";
import { getVisibleArticleSlugs, getVisibleBookSlugs } from "@/lib/access";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const categorySlug = slug[slug.length - 1];

  const category = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, categorySlug))
    .limit(1);

  if (!category[0]) notFound();

  const session = await getSession();

  const rawResults = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      summary: articles.summary,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .innerJoin(articleCategories, eq(articles.id, articleCategories.articleId))
    .where(and(eq(articleCategories.categoryId, category[0].id), eq(articles.isInternal, false)));

  // Filter by article visibility
  const visibleArticleSlugs = await getVisibleArticleSlugs(session, rawResults.map((a) => a.slug));
  const filtered =
    visibleArticleSlugs === "all"
      ? rawResults
      : rawResults.filter((a) => visibleArticleSlugs.has(a.slug));

  // Filter out articles belonging only to private books
  let results = filtered;
  if (filtered.length > 0) {
    const articleBookSlugs = await db
      .select({ articleSlug: articles.slug, bookSlug: curriculumEntries.bookSlug })
      .from(articles)
      .innerJoin(curriculumEntries, eq(curriculumEntries.articleId, articles.id))
      .where(inArray(articles.slug, filtered.map((a) => a.slug)));

    const allBookSlugs = [...new Set(articleBookSlugs.map((r) => r.bookSlug))];
    const visibleBooks = await getVisibleBookSlugs(session, allBookSlugs);

    const articleToBooks = new Map<string, string[]>();
    for (const r of articleBookSlugs) {
      const list = articleToBooks.get(r.articleSlug) ?? [];
      list.push(r.bookSlug);
      articleToBooks.set(r.articleSlug, list);
    }

    results = filtered.filter((a) => {
      const books = articleToBooks.get(a.slug);
      if (!books || books.length === 0) return true;
      if (visibleBooks === "all") return true;
      return books.some((b) => visibleBooks.has(b));
    });
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <Link
        href="/category"
        className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mb-6 inline-block"
      >
        ← All categories
      </Link>

      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">
          {category[0].name}
        </h1>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          {results.length} {results.length === 1 ? "article" : "articles"}
        </p>
      </header>

      <hr className="border-zinc-200 dark:border-zinc-800 mb-8" />

      {results.length === 0 ? (
        <p className="text-zinc-400 dark:text-zinc-500 text-sm">
          No articles in this category yet.
        </p>
      ) : (
        <ul className="space-y-6">
          {results.map((a) => (
            <li key={a.id}>
              <ArticleCard {...a} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
