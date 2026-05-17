import { db } from "@/db";
import { categories, articleCategories, articles, publishers, resourceVisibility } from "@/db/schema";
import { eq, and, sql, or, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import ArticleCard from "@/components/ArticleCard";
import { getSession } from "@/lib/auth";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const categorySlug = slug[slug.length - 1];

  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, categorySlug))
    .limit(1);

  if (!category) notFound();

  const session = await getSession();

  const conditions: ReturnType<typeof eq>[] = [
    eq(articleCategories.categoryId, category.id) as unknown as ReturnType<typeof eq>,
    eq(articles.isInternal, false) as unknown as ReturnType<typeof eq>,
  ];

  if (!session?.isRootAdmin) {
    conditions.push(
      sql`${articles.metadata}->>'status' = 'published'` as unknown as ReturnType<typeof eq>
    );
    conditions.push(
      or(
        isNull(resourceVisibility.visibility),
        eq(resourceVisibility.visibility, "public")
      ) as unknown as ReturnType<typeof eq>
    );
  }

  const results = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      summary: articles.summary,
      updatedAt: articles.updatedAt,
      publisherSlug: publishers.slug,
    })
    .from(articles)
    .innerJoin(articleCategories, eq(articles.id, articleCategories.articleId))
    .leftJoin(
      resourceVisibility,
      and(
        eq(resourceVisibility.resourceType, "article"),
        eq(resourceVisibility.ownerType, articles.ownerType),
        eq(resourceVisibility.ownerId, articles.ownerId),
        eq(resourceVisibility.resourceKey, articles.slug)
      )
    )
    .leftJoin(
      publishers,
      or(
        and(eq(articles.ownerType, "user"), eq(publishers.kind, "user"), eq(publishers.userId, articles.ownerId)),
        and(eq(articles.ownerType, "org"), eq(publishers.kind, "org"), eq(publishers.orgId, articles.ownerId))
      )
    )
    .where(and(...conditions));

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <Link href="/category" className="text-sm themed-link mb-6 inline-block">
        &larr; All categories
      </Link>

      <header className="mb-8">
        <h1 className="text-4xl font-bold themed-heading mb-2">{category.name}</h1>
        <p className="text-sm themed-muted">
          {results.length} {results.length === 1 ? "article" : "articles"}
        </p>
      </header>

      <hr className="border-zinc-200 dark:border-zinc-800 mb-8" />

      {results.length === 0 ? (
        <p className="themed-muted text-sm">No articles in this category yet.</p>
      ) : (
        <ul className="space-y-6">
          {results.map((a) => (
            <li key={a.id}>
              <ArticleCard
                publisherSlug={a.publisherSlug ?? "unknown"}
                slug={a.slug}
                title={a.title}
                summary={a.summary}
                updatedAt={a.updatedAt}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
