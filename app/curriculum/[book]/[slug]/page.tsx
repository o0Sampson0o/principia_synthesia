import { db } from "@/db";
import { articles, curriculumEntries, categories, articleCategories } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import "katex/dist/katex.min.css";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canViewBook } from "@/lib/access";
import DynamicAnimation from "@/components/DynamicAnimation";
import ArticleMetadataDisplay from "@/components/ArticleMetadata";
import { parseFrontmatter } from "@/lib/frontmatter";

export default async function CurriculumArticlePage({
  params,
}: {
  params: Promise<{ book: string; slug: string }>;
}) {
  const { book: bookSlug, slug } = await params;

  const article = await db
    .select()
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);

  if (!article[0]) notFound();
  if (article[0].isInternal && article[0].parentBookSlug !== bookSlug) notFound();

  const entry = await db
    .select()
    .from(curriculumEntries)
    .where(
      and(
        eq(curriculumEntries.bookSlug, bookSlug),
        eq(curriculumEntries.articleId, article[0].id)
      )
    )
    .limit(1);

  if (!entry[0]) notFound();

  const entries = await db
    .select({
      articleSlug: articles.slug,
      articleTitle: articles.title,
    })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(eq(curriculumEntries.bookSlug, bookSlug))
    .orderBy(asc(curriculumEntries.position));

  const currentIndex = entries.findIndex((e) => e.articleSlug === slug);
  const prevEntry = currentIndex > 0 ? entries[currentIndex - 1] : null;
  const nextEntry =
    currentIndex < entries.length - 1 ? entries[currentIndex + 1] : null;

  const { title, summary, content, createdAt, updatedAt } = article[0];
  const bookTitle = entry[0].bookTitle;

  // Parse and strip frontmatter before rendering
  const { metadata, body: articleBody } = parseFrontmatter(content ?? "");

  // Auto-prepend canvas animation if set (re-validate slug format as defense in depth)
  const safeCanvas =
    metadata.canvas && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.canvas)
      ? metadata.canvas
      : null;
  const renderedBody = safeCanvas
    ? `<DynamicAnimation slug="${safeCanvas}" />\n\n${articleBody}`
    : articleBody;
  const session = await getSession();
  if (!(await canViewBook(bookSlug, session))) notFound();

  const articleCats = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .innerJoin(articleCategories, eq(categories.id, articleCategories.categoryId))
    .where(eq(articleCategories.articleId, article[0].id));

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link
        href={`/curriculum/${bookSlug}`}
        className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mb-6 inline-block"
      >
        ← Back to {bookTitle}
      </Link>

      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
          {title}
        </h1>
        {summary && (
          <p className="text-lg text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
            {summary}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500">
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

        {/* Frontmatter metadata: status badge, description, tags */}
        <ArticleMetadataDisplay metadata={metadata} />
      </header>

      <hr className="border-zinc-200 dark:border-zinc-800 mb-8" />

      <article className="markdown-content">
        <MDXRemote
          source={renderedBody}
          components={{ DynamicAnimation }}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkMath, remarkGfm, remarkWikilinks],
              rehypePlugins: [rehypeKatex],
            },
          }}
        />
      </article>

      {(prevEntry || nextEntry) && (
        <nav className="flex justify-between mt-12 pt-6 border-t border-zinc-200 dark:border-zinc-800">
          {prevEntry ? (
            <Link
              href={`/curriculum/${bookSlug}/${prevEntry.articleSlug}`}
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            >
              ← {prevEntry.articleTitle}
            </Link>
          ) : (
            <div />
          )}
          {nextEntry ? (
            <Link
              href={`/curriculum/${bookSlug}/${nextEntry.articleSlug}`}
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors text-right"
            >
              {nextEntry.articleTitle} →
            </Link>
          ) : (
            <div />
          )}
        </nav>
      )}
    </main>
  );
}
