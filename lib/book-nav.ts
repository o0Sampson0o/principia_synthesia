/**
 * Client-safe book navigation: the node shapes and the URL builders.
 *
 * Split out of lib/book-structure.ts because that module imports `db` to load a
 * curriculum. BookSpine is a client component, so importing the href helpers
 * from there pulled drizzle and the postgres driver into the browser bundle —
 * a module-not-found at build time. Nothing in this file may import the DB.
 *
 * lib/book-structure.ts re-exports everything here, so existing imports of
 * `sectionHref` / `dividerHref` / the node types keep working unchanged.
 */

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
