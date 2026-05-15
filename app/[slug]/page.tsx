import { db } from "@/db";
import { articles, categories, articleCategories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import "katex/dist/katex.min.css";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canViewArticle } from "@/lib/access";
import DynamicAnimation from "@/components/DynamicAnimation";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [session, articleRows] = await Promise.all([
    getSession(),
    db.select().from(articles).where(eq(articles.slug, slug)).limit(1),
  ]);

  if (!articleRows[0]) notFound();
  const article = articleRows[0];
  if (article.isInternal) notFound();
  if (!(await canViewArticle(slug, session))) notFound();

  const articleCats = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .innerJoin(articleCategories, eq(categories.id, articleCategories.categoryId))
    .where(eq(articleCategories.articleId, article.id));

  const { title, summary, content, createdAt, updatedAt } = article;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
          {title}
        </h1>
        {summary && (
          <p className="text-lg text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
            {summary}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500 flex-wrap">
          {createdAt && (
            <span>
              Created{" "}
              {createdAt.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
          {updatedAt && updatedAt.getTime() !== createdAt?.getTime() && (
            <>
              <span className="text-zinc-200 dark:text-zinc-700">·</span>
              <span>
                Updated{" "}
                {updatedAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </>
          )}
          {session?.isAdmin && (
            <>
              <span className="text-zinc-200 dark:text-zinc-700">·</span>
              <Link
                href={`/admin/articles/${slug}/edit`}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors underline underline-offset-2"
              >
                Edit
              </Link>
            </>
          )}
        </div>

        {/* Category tags */}
        {articleCats.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {articleCats.map((c) => (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                className="text-xs px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      <hr className="border-zinc-200 dark:border-zinc-800 mb-8" />

      <article className="markdown-content">
        <MDXRemote
          source={content || ""}
          components={{ DynamicAnimation }}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkMath, remarkGfm, remarkWikilinks],
              rehypePlugins: [rehypeKatex],
            },
          }}
        />
      </article>
    </main>
  );
}
