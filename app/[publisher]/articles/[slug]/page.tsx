import { db } from "@/db";
import { articles, categories, articleCategories, articleViews } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { resolvePublisher } from "@/lib/publisher";
import { canEditContent } from "@/lib/roles";
import DynamicAnimation from "@/components/DynamicAnimation";
import ArticleImage from "@/components/ArticleImage";
import MdxParagraph from "@/components/MdxParagraph";
import ArticleMetadataDisplay from "@/components/ArticleMetadata";
import { parseFrontmatter } from "@/lib/frontmatter";
import RelatedEvents from "@/components/RelatedEvents";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ publisher: string; slug: string }>;
}) {
  const { publisher: publisherSlug, slug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const [session, articleRows] = await Promise.all([
    getSession(),
    db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.slug, slug),
          eq(articles.ownerType, ownerType),
          eq(articles.ownerId, ownerId)
        )
      )
      .limit(1),
  ]);

  if (!articleRows[0]) notFound();
  const article = articleRows[0];

  // Internal articles are not accessible via the /articles/ route
  if (article.isInternal) notFound();

  if (!(await canView({ type: "article", ownerType, ownerId, slug }, session))) notFound();

  // Record view (fire-and-forget; ignore errors)
  db.insert(articleViews).values({ articleId: article.id }).catch(() => {});

  const isEditor = await canEditContent(session, ownerType as "user" | "org", ownerId);

  const articleCats = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .innerJoin(articleCategories, eq(categories.id, articleCategories.categoryId))
    .where(eq(articleCategories.articleId, article.id));

  const { title, summary, content, createdAt, updatedAt } = article;
  const { metadata, body } = parseFrontmatter(content ?? "");

  // Auto-prepend canvas animation if set
  const safeCanvas =
    metadata.canvas && /^anim-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.canvas)
      ? metadata.canvas
      : null;
  const renderedBody = safeCanvas
    ? `<DynamicAnimation publisher="${publisherSlug}" slug="${safeCanvas}" />\n\n${body}`
    : body;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight themed-heading mb-3">{title}</h1>
        {summary && (
          <p className="text-lg themed-muted mb-4 leading-relaxed">{summary}</p>
        )}
        <div className="flex items-center gap-4 text-xs themed-muted flex-wrap">
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
              <span className="opacity-30">·</span>
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
          {isEditor && (
            <>
              <span className="opacity-30">·</span>
              <Link
                href={`/${publisherSlug}/articles/${slug}/edit`}
                className="themed-link underline underline-offset-2"
              >
                Edit
              </Link>
            </>
          )}
        </div>
        <ArticleMetadataDisplay
          metadata={metadata}
          categories={articleCats}
          publisherSlug={publisherSlug}
        />
      </header>

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

      <RelatedEvents articleId={article.id} publisherSlug={publisherSlug} />
    </main>
  );
}
