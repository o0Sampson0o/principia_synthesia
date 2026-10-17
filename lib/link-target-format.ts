import { formatWikilink } from "@/lib/wikilink-syntax";

/** Something a wikilink can point at, found by `searchLinkTargets`. */
export type LinkTarget =
  | { kind: "article"; title: string; publisherSlug: string; slug: string }
  | { kind: "book"; title: string; publisherSlug: string; slug: string }
  | { kind: "section"; title: string; publisherSlug: string; slug: string; bookSlug: string; bookTitle: string };

/**
 * The wikilink an author would otherwise type by hand. Book sections always
 * use the book-qualified form — a section slug is only unique inside its book
 * — and every link carries the target's title as its label, so readers see
 * "Galilean Relativity", never "article-galilean-relativity".
 */
export function linkTargetToWikilink(t: LinkTarget): string {
  if (t.kind === "section") {
    return formatWikilink({ publisher: t.publisherSlug, type: "books", slug: t.bookSlug, section: t.slug, label: t.title });
  }
  return formatWikilink({
    publisher: t.publisherSlug,
    type: t.kind === "book" ? "books" : "articles",
    slug: t.slug,
    label: t.title,
  });
}

/**
 * Whether the text before the caret is an unfinished `[[query` the completion
 * should take over, and the query typed so far. Hand-typed link syntax (a `:`
 * or `|` after `[[`) is left alone, as is anything spanning `]`.
 */
export function matchWikilinkQuery(before: string): { query: string; start: number } | null {
  const m = /\[\[([^\[\]|:\n]{0,100})$/.exec(before);
  if (!m) return null;
  return { query: m[1], start: m.index };
}
