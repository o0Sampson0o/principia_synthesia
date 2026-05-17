import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { books, articles, curriculumEntries, articleViews } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { canEditContent } from "@/lib/roles";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import "katex/dist/katex.min.css";
import DynamicAnimation from "@/components/DynamicAnimation";
import ArticleImage from "@/components/ArticleImage";
import MdxParagraph from "@/components/MdxParagraph";
import { parseFrontmatter } from "@/lib/frontmatter";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ publisher: string; bookSlug: string; chapter: string }>;
}) {
  const { publisher: publisherSlug, bookSlug, chapter: chapterSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const [bookRow] = await db
    .select()
    .from(books)
    .where(and(eq(books.slug, bookSlug), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId)))
    .limit(1);
  if (!bookRow) notFound();

  const session = await getSession();
  if (!(await canView({ type: "book", ownerType, ownerId, slug: bookSlug }, session))) notFound();

  // Find the article. It must either be internal (parentBookId === bookRow.id) or
  // a regular article with a curriculum entry in this book.
  const [article] = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.slug, chapterSlug),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId)
      )
    )
    .limit(1);

  if (!article) notFound();

  // Internal article: verify parentBookId matches
  if (article.isInternal && article.parentBookId !== bookRow.id) notFound();

  // Non-internal article: verify it has a curriculum entry in this book
  if (!article.isInternal) {
    const [entry] = await db
      .select({ id: curriculumEntries.id })
      .from(curriculumEntries)
      .where(
        and(eq(curriculumEntries.bookId, bookRow.id), eq(curriculumEntries.articleId, article.id))
      )
      .limit(1);
    if (!entry) notFound();
  }

  // Record view
  db.insert(articleViews).values({ articleId: article.id }).catch(() => {});

  const isEditor = await canEditContent(session, ownerType, ownerId);

  // Get all entries for prev/next navigation
  const allEntries = await db
    .select({ articleSlug: articles.slug, position: curriculumEntries.position })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(eq(curriculumEntries.bookId, bookRow.id))
    .orderBy(asc(curriculumEntries.position));

  const currentIdx = allEntries.findIndex((e) => e.articleSlug === chapterSlug);
  const prevSlug = currentIdx > 0 ? allEntries[currentIdx - 1].articleSlug : null;
  const nextSlug = currentIdx < allEntries.length - 1 ? allEntries[currentIdx + 1].articleSlug : null;

  const { metadata, body } = parseFrontmatter(article.content ?? "");
  const safeCanvas =
    metadata.canvas && /^anim-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.canvas)
      ? metadata.canvas
      : null;
  const renderedBody = safeCanvas
    ? `<DynamicAnimation publisher="${publisherSlug}" slug="${safeCanvas}" />\n\n${body}`
    : body;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="text-sm themed-muted mb-6 flex gap-2">
        <Link href={`/${publisherSlug}`} className="themed-link">@{publisherSlug}</Link>
        <span>/</span>
        <Link href={`/${publisherSlug}/books/${bookSlug}`} className="themed-link">{bookRow.title}</Link>
      </div>

      <h1 className="text-4xl font-bold themed-heading mb-6">{article.title}</h1>

      {isEditor && (
        <div className="mb-6">
          <Link
            href={`/${publisherSlug}/articles/${chapterSlug}/edit`}
            className="text-sm themed-link"
          >
            Edit chapter
          </Link>
        </div>
      )}

      <article className="markdown-content">
        <MDXRemote
          source={renderedBody}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkMath, remarkGfm, remarkWikilinks],
              rehypePlugins: [rehypeKatex],
            },
          }}
          components={{ DynamicAnimation, img: ArticleImage, p: MdxParagraph }}
        />
      </article>

      <nav className="flex justify-between mt-12 pt-6 border-t themed-border text-sm">
        {prevSlug ? (
          <Link href={`/${publisherSlug}/books/${bookSlug}/${prevSlug}`} className="themed-link">
            &larr; Previous
          </Link>
        ) : (
          <span />
        )}
        {nextSlug && (
          <Link href={`/${publisherSlug}/books/${bookSlug}/${nextSlug}`} className="themed-link">
            Next &rarr;
          </Link>
        )}
      </nav>
    </main>
  );
}
