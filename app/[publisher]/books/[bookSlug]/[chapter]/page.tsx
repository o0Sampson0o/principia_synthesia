import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { books, articles, curriculumEntries, articleViews, publishers } from "@/db/schema";
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

  // Find the article via its curriculum entry — this handles articles owned by
  // a different publisher than the book (cross-publisher curriculum entries).
  const [entryRow] = await db
    .select({ article: articles })
    .from(curriculumEntries)
    .innerJoin(articles, eq(curriculumEntries.articleId, articles.id))
    .where(and(eq(curriculumEntries.bookId, bookRow.id), eq(articles.slug, chapterSlug)))
    .limit(1);

  const article = entryRow?.article;
  if (!article) notFound();

  // Internal article: must belong to this book
  if (article.isInternal && article.parentBookId !== bookRow.id) notFound();

  // Record view
  db.insert(articleViews).values({ articleId: article.id }).catch(() => {});

  // Resolve the article's own publisher slug — it may differ from the book's
  // publisher when a cross-publisher article is added to the curriculum.
  const articleOwnerType = article.ownerType as "user" | "org";
  const articleOwnerId = article.ownerId;
  const [articlePublisherRow] = await db
    .select({ slug: publishers.slug })
    .from(publishers)
    .where(
      articleOwnerType === "user"
        ? eq(publishers.userId, articleOwnerId)
        : eq(publishers.orgId, articleOwnerId)
    )
    .limit(1);
  const articlePublisherSlug = articlePublisherRow?.slug ?? publisherSlug;

  const isEditor = await canEditContent(session, articleOwnerType, articleOwnerId);

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
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="text-sm themed-muted mb-6 flex gap-2">
        <Link href={`/${publisherSlug}`} className="themed-link">@{publisherSlug}</Link>
        <span>/</span>
        <Link href={`/${publisherSlug}/books/${bookSlug}`} className="themed-link">{bookRow.title}</Link>
      </div>

      <h1 className="text-4xl font-bold themed-heading mb-2">{article.title}</h1>
      {articlePublisherSlug !== publisherSlug && (
        <p className="text-sm themed-muted mb-6">
          Originally by{" "}
          <Link href={`/${articlePublisherSlug}`} className="themed-link">
            @{articlePublisherSlug}
          </Link>
        </p>
      )}
      {articlePublisherSlug === publisherSlug && <div className="mb-6" />}

      {isEditor && (
        <div className="mb-6">
          <Link
            href={`/${articlePublisherSlug}/articles/${chapterSlug}/edit`}
            className="text-sm themed-link"
          >
            Edit chapter
          </Link>
        </div>
      )}

      <div className="markdown-content">
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
      </div>

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
