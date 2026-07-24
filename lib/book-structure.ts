/**
 * Book structure builder.
 *
 * A book's curriculum (`curriculumEntries`) is a FLAT, position-ordered list.
 * Section rows carry an `articleId`; divider rows (Part / Chapter labels) have a
 * NULL `articleId`, their text in `partTitle`, and their level in `dividerLevel`
 * (legacy NULL = part). The Part › Chapter › Section hierarchy is purely
 * positional — a part owns everything until the next part; a chapter until the
 * next chapter or part — and is reconstructed here at render time.
 *
 * Parts/chapters have no stored slug or URL identity, so we derive readable
 * slugs on the fly (github-slugger, deduped in position order → deterministic).
 * These are computed, not permalinks: renaming a label changes its URL. Section
 * (article-slug) URLs stay stable.
 *
 * `resolvePath` keys off the LAST URL segment so intermediate segments are
 * optional — `/book/part/chapter/article`, `/book/part/article`, `/book/article`
 * (backward-compatible 2-seg), `/book/part/chapter`, and `/book/part` all resolve.
 */
import GithubSlugger from "github-slugger";
import { db } from "@/db";
import { articles, curriculumEntries, publishers } from "@/db/schema";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

export interface SectionNode {
  kind: "section";
  articleId: number;
  slug: string;
  title: string;
  position: number;
  /** Owning publisher slug (differs from the book's publisher for borrowed sections). */
  publisherSlug: string | null;
}

export interface ChapterNode {
  kind: "chapter";
  slug: string;
  title: string;
  position: number;
  parentPartSlug: string | null;
  children: SectionNode[];
}

export interface PartNode {
  kind: "part";
  slug: string;
  title: string;
  position: number;
  children: Array<ChapterNode | SectionNode>;
}

export type BookChild = PartNode | ChapterNode | SectionNode;

/** One curriculum row as loaded from the DB (article fields left-joined). */
export interface CurriculumRow {
  articleId: number | null;
  position: number;
  partTitle: string | null;
  dividerLevel: "part" | "chapter" | null;
  articleSlug: string | null;
  articleTitle: string | null;
  articlePublisherSlug: string | null;
}

export interface ArticleLoc {
  section: SectionNode;
  part: PartNode | null;
  chapter: ChapterNode | null;
  /** Index into `orderedSections` — used for prev/next. */
  flatIndex: number;
}

export interface BookStructure {
  /** Top-level nodes in position order (parts, plus chapters/sections before any part). */
  children: BookChild[];
  parts: PartNode[];
  /** All sections in flat position order (for prev/next). */
  orderedSections: SectionNode[];
  /** article slug → its location + ancestors. */
  articleIndex: Map<string, ArticleLoc>;
  /** derived divider slug → its node. */
  dividerIndex: Map<string, PartNode | ChapterNode>;
}

/** Build the nested structure from position-ordered curriculum rows. Pure. */
export function buildBookStructure(rows: CurriculumRow[]): BookStructure {
  const sorted = [...rows].sort((a, b) => a.position - b.position);

  // Article slugs already present — divider slugs must never equal one of these,
  // because `resolvePath` lets sections win, which would otherwise make a
  // same-named part/chapter unreachable.
  const articleSlugSet = new Set<string>();
  for (const r of sorted) {
    if (r.articleId != null && r.articleSlug) articleSlugSet.add(r.articleSlug);
  }

  const slugger = new GithubSlugger();
  const dividerSlug = (title: string): string => {
    const base = title.trim();
    let s = slugger.slug(base);
    // Re-slugging the same base yields base-1, base-2, … — bump past collisions.
    while (articleSlugSet.has(s)) s = slugger.slug(base);
    return s;
  };

  const children: BookChild[] = [];
  const parts: PartNode[] = [];
  const orderedSections: SectionNode[] = [];
  const articleIndex = new Map<string, ArticleLoc>();
  const dividerIndex = new Map<string, PartNode | ChapterNode>();

  let currentPart: PartNode | null = null;
  let currentChapter: ChapterNode | null = null;

  for (const r of sorted) {
    if (r.articleId == null) {
      // Divider row (Part or Chapter label).
      const title = (r.partTitle ?? "").trim();
      if (!title) continue;
      const level: "part" | "chapter" = r.dividerLevel === "chapter" ? "chapter" : "part";
      const slug = dividerSlug(title);
      if (level === "part") {
        const node: PartNode = { kind: "part", slug, title, position: r.position, children: [] };
        parts.push(node);
        children.push(node);
        dividerIndex.set(slug, node);
        currentPart = node;
        currentChapter = null; // a part closes the open chapter
      } else {
        const node: ChapterNode = {
          kind: "chapter",
          slug,
          title,
          position: r.position,
          parentPartSlug: currentPart?.slug ?? null,
          children: [],
        };
        if (currentPart) currentPart.children.push(node);
        else children.push(node);
        dividerIndex.set(slug, node);
        currentChapter = node;
      }
    } else {
      // Section row. A joined-but-deleted article has a NULL slug → skip it.
      if (!r.articleSlug) continue;
      const node: SectionNode = {
        kind: "section",
        articleId: r.articleId,
        slug: r.articleSlug,
        title: r.articleTitle ?? r.articleSlug,
        position: r.position,
        publisherSlug: r.articlePublisherSlug ?? null,
      };
      if (currentChapter) currentChapter.children.push(node);
      else if (currentPart) currentPart.children.push(node);
      else children.push(node);
      orderedSections.push(node);
      articleIndex.set(node.slug, {
        section: node,
        part: currentPart,
        chapter: currentChapter,
        flatIndex: orderedSections.length - 1,
      });
    }
  }

  return { children, parts, orderedSections, articleIndex, dividerIndex };
}

export type Resolved =
  | { type: "article"; loc: ArticleLoc }
  | { type: "divider"; node: PartNode | ChapterNode; part: PartNode | null }
  | null;

/**
 * Resolve a flexible URL path to a target by its LAST segment (sections win over
 * dividers). Intermediate segments are ignored — the breadcrumb is rebuilt from
 * the actual structure, not from the URL.
 */
export function resolvePath(structure: BookStructure, path: string[]): Resolved {
  if (path.length === 0) return null;
  const last = path[path.length - 1];

  const loc = structure.articleIndex.get(last);
  if (loc) return { type: "article", loc };

  const node = structure.dividerIndex.get(last);
  if (node) {
    if (node.kind === "part") return { type: "divider", node, part: null };
    const parent = node.parentPartSlug ? structure.dividerIndex.get(node.parentPartSlug) : null;
    return { type: "divider", node, part: parent && parent.kind === "part" ? parent : null };
  }
  return null;
}

/** Canonical 2-segment section URL (backward compatible). */
export function sectionHref(publisher: string, bookSlug: string, slug: string): string {
  return `/${publisher}/books/${bookSlug}/${slug}`;
}

/** Readable nested URL for a Part or Chapter (chapter includes its parent part). */
export function dividerHref(
  publisher: string,
  bookSlug: string,
  node: PartNode | ChapterNode
): string {
  if (node.kind === "part") return `/${publisher}/books/${bookSlug}/${node.slug}`;
  return node.parentPartSlug
    ? `/${publisher}/books/${bookSlug}/${node.parentPartSlug}/${node.slug}`
    : `/${publisher}/books/${bookSlug}/${node.slug}`;
}

/** Load a book's curriculum and build its structure. */
export async function loadBookStructure(bookId: number): Promise<BookStructure> {
  const rows = await db
    .select({
      articleId: curriculumEntries.articleId,
      position: curriculumEntries.position,
      partTitle: curriculumEntries.partTitle,
      dividerLevel: curriculumEntries.dividerLevel,
      articleSlug: articles.slug,
      articleTitle: articles.title,
      articlePublisherSlug: publishers.slug,
    })
    .from(curriculumEntries)
    // left-join so divider rows (NULL articleId) and deleted-article rows survive
    .leftJoin(articles, and(eq(curriculumEntries.articleId, articles.id), isNull(articles.deletedAt)))
    .leftJoin(
      publishers,
      or(
        and(eq(articles.ownerType, sql`'user'`), eq(publishers.userId, articles.ownerId)),
        and(eq(articles.ownerType, sql`'org'`), eq(publishers.orgId, articles.ownerId))
      )
    )
    .where(eq(curriculumEntries.bookId, bookId))
    .orderBy(asc(curriculumEntries.position));

  return buildBookStructure(rows as CurriculumRow[]);
}
