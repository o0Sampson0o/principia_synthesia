/**
 * Single source of truth for rendering an article's MDX body.
 *
 * The published pages (`app/[publisher]/articles/[slug]/page.tsx` and the book
 * section page) render the body with `<MDXRemote>` from `next-mdx-remote/rsc`.
 * The editor "Preview" needs the *same* visual output but as an HTML string it
 * can inject via `dangerouslySetInnerHTML`. Historically Preview used a separate
 * `remark-parse` (CommonMark) pipeline, which parses HTML blocks differently
 * from MDX and so rendered the same source differently (lists/math/`<details>`
 * bodies sitting directly under an HTML block got swallowed).
 *
 * This module keeps the plugin options, the component map, and the body
 * preparation in one place. The published pages (`page.tsx`, book section page)
 * import `articleComponents` + `buildArticleMdxOptions` for `<MDXRemote>`; the
 * editor Preview (`lib/preview-mdx-render.ts`) reuses `prepareArticleBody` +
 * `resolveCitations` and renders the same source to HTML with `remark-mdx`.
 */
import type { PluggableList } from "unified";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import { remarkCallouts } from "@/lib/remark-callouts";
import { remarkQuoteAttribution } from "@/lib/remark-quote-attribution";
import { remarkCiteNumbering, type ResolvedCitation } from "@/lib/remark-cite-numbering";
import { buildCitationIndex } from "@/lib/mdx-cite-numbering";
import { parseFrontmatter } from "@/lib/frontmatter";
import { normalizeDetailsBlocks } from "@/lib/normalize-details";
import { db } from "@/db";
import { articles, publishers } from "@/db/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { config } from "@/lib/config";
import type { ArticleMetadata } from "@/lib/validations";

import DynamicAnimation from "@/components/DynamicAnimation";
import ArticleImage from "@/components/ArticleImage";
import MdxParagraph from "@/components/MdxParagraph";
import Cite from "@/components/Cite";
import { MdH1, MdH2, MdH3 } from "@/components/MdHeadings";

/** Frontmatter `canvas:` values allowed to auto-prepend a `<DynamicAnimation>`. */
const CANVAS_SLUG_RE = /^anim-[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// MDX options + component maps
// ---------------------------------------------------------------------------

/**
 * The `options` object passed to `<MDXRemote>` / `compileMDX`. Parameterized by
 * the citation maps so `remarkCiteNumbering` can resolve `<Cite>` nodes.
 */
export function buildArticleMdxOptions(cites: {
  slugToNumber: Map<string, number>;
  resolved: Map<string, ResolvedCitation>;
}): { mdxOptions: { remarkPlugins: PluggableList; rehypePlugins: PluggableList } } {
  return {
    mdxOptions: {
      remarkPlugins: [
        remarkMath,
        remarkGfm,
        remarkCallouts,
        remarkQuoteAttribution,
        remarkWikilinks,
        [remarkCiteNumbering, { slugToNumber: cites.slugToNumber, resolved: cites.resolved }],
      ],
      rehypePlugins: [rehypeSlug, rehypeKatex],
    },
  };
}

/** Component map for the published RSC pages (may contain client components). */
export const articleComponents = {
  DynamicAnimation,
  img: ArticleImage,
  p: MdxParagraph,
  Cite,
  h1: MdH1,
  h2: MdH2,
  h3: MdH3,
};

// The editor Preview does NOT reuse these React components — it renders the
// same source to HTML via `unified` + `remark-mdx` (no `react-dom/server`, which
// Next bans in the RSC layer). See `lib/preview-mdx-render.ts`, which mirrors
// `<Cite>` and `<DynamicAnimation>` as hast so the visual output matches.

// ---------------------------------------------------------------------------
// Body preparation
// ---------------------------------------------------------------------------

/**
 * Strip frontmatter, auto-prepend the canvas `<DynamicAnimation>` (when the
 * `canvas:` frontmatter is a valid `anim-*` slug), and normalize `<details>`
 * blocks. Returns the parsed `metadata`, the frontmatter-stripped `body` (for
 * TOC + citation extraction), and the `renderedBody` fed to MDX.
 */
export function prepareArticleBody(
  content: string,
  opts: { publisherSlug: string }
): { metadata: ArticleMetadata; body: string; renderedBody: string } {
  const { metadata, body } = parseFrontmatter(content ?? "");
  const canvas = metadata.canvas && CANVAS_SLUG_RE.test(metadata.canvas) ? metadata.canvas : null;
  const normalized = normalizeDetailsBlocks(body);
  const renderedBody = canvas
    ? `<DynamicAnimation publisher="${opts.publisherSlug}" slug="${canvas}" />\n\n${normalized}`
    : normalized;
  return { metadata, body, renderedBody };
}

// ---------------------------------------------------------------------------
// Citation resolution (batched — two queries total, not two per citation)
// ---------------------------------------------------------------------------

/**
 * Build the `<Cite>` numbering index for `body` and resolve each fully-qualified
 * `publisher/slug` citation to a title + href via two batched DB queries.
 */
export async function resolveCitations(body: string): Promise<{
  slugToNumber: Map<string, number>;
  orderedSlugs: string[];
  resolved: Map<string, ResolvedCitation>;
}> {
  const { slugToNumber, orderedSlugs } = buildCitationIndex(body);
  const resolved = new Map<string, ResolvedCitation>();
  if (orderedSlugs.length === 0) return { slugToNumber, orderedSlugs, resolved };

  const parsed = orderedSlugs
    .map((citeSlug) => {
      const slashIdx = citeSlug.indexOf("/");
      if (slashIdx === -1) return null;
      return {
        citeSlug,
        publisherSlug: citeSlug.slice(0, slashIdx),
        articleSlug: citeSlug.slice(slashIdx + 1),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const pubRows = parsed.length
    ? await db
        .select({
          slug: publishers.slug,
          kind: publishers.kind,
          userId: publishers.userId,
          orgId: publishers.orgId,
        })
        .from(publishers)
        .where(inArray(publishers.slug, [...new Set(parsed.map((p) => p.publisherSlug))]))
    : [];
  const pubBySlug = new Map(pubRows.map((p) => [p.slug, p]));

  const articleConds = parsed.flatMap((p) => {
    const citePub = pubBySlug.get(p.publisherSlug);
    if (!citePub) return [];
    const citeOwnerId = citePub.kind === "user" ? citePub.userId : citePub.orgId;
    if (citeOwnerId === null) return [];
    return [
      and(
        eq(articles.ownerType, citePub.kind),
        eq(articles.ownerId, citeOwnerId),
        eq(articles.slug, p.articleSlug),
        isNull(articles.deletedAt)
      ),
    ];
  });

  const citeArticleRows = articleConds.length
    ? await db
        .select({
          ownerType: articles.ownerType,
          ownerId: articles.ownerId,
          slug: articles.slug,
          title: articles.title,
        })
        .from(articles)
        .where(or(...articleConds))
    : [];
  const titleByOwnerSlug = new Map(
    citeArticleRows.map((a) => [`${a.ownerType}:${a.ownerId}:${a.slug}`, a.title])
  );

  for (const p of parsed) {
    const citePub = pubBySlug.get(p.publisherSlug);
    if (!citePub) continue;
    const citeOwnerId = citePub.kind === "user" ? citePub.userId : citePub.orgId;
    if (citeOwnerId === null) continue;
    const title = titleByOwnerSlug.get(`${citePub.kind}:${citeOwnerId}:${p.articleSlug}`);
    if (title === undefined) continue;
    resolved.set(p.citeSlug, {
      title,
      href: `${config.siteUrl}/${p.publisherSlug}/articles/${p.articleSlug}`,
    });
  }

  return { slugToNumber, orderedSlugs, resolved };
}
