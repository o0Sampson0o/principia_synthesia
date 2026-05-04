import { db } from "@/db";
import { categories, articleCategories, articles } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

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

  const results = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      summary: articles.summary,
    })
    .from(articles)
    .innerJoin(articleCategories, eq(articles.id, articleCategories.articleId))
    .where(eq(articleCategories.categoryId, category[0].id));

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-8">{category[0].name}</h1>
      <ul className="space-y-4">
        {results.map((a) => (
          <li key={a.id}>
            <Link
              href={`/${a.slug}`}
              className="text-blue-600 text-lg hover:underline"
            >
              {a.title}
            </Link>
            <p className="text-gray-500 text-sm">{a.summary}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
