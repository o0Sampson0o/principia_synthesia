/**
 * Single source of truth for the wikilink syntax
 * `[[publisher:type:slug]]` / `[[publisher:type:slug|Label]]`.
 * Consumed by the remark transform (publish pipeline), the editor's Lezer
 * parser, and the live-preview chip widget.
 *
 * A fourth segment addresses a section inside a book:
 * `[[publisher:books:book-slug:section-slug]]`. Book-internal article slugs are
 * only unique within their book (see the partial indexes on `articles`), so a
 * bare `[[pub:articles:intro]]` cannot say *which* book's intro — this form can.
 */

/** Global-flags instance for scanning prose. Create locals via `wikilinkRe()`. */
export const WIKILINK_SOURCE =
  "\\[\\[([a-z0-9-]+):(articles|books|objects):([a-z0-9-]+)(?::([a-z0-9-]+))?(?:\\|([^\\]]+))?\\]\\]";

export function wikilinkRe(): RegExp {
  return new RegExp(WIKILINK_SOURCE, "g");
}

const EXACT_RE = new RegExp(`^${WIKILINK_SOURCE}$`);

export interface ParsedWikilink {
  publisher: string;
  type: "articles" | "books" | "objects";
  slug: string;
  /** Section slug, for the 4-segment book form. Null otherwise. */
  section: string | null;
  label: string | null;
  href: string;
  /** What a reader should see: the label when present, else the target slug. */
  display: string;
}

/**
 * Builds a wikilink from already-captured parts, or null when the combination
 * is not meaningful. Shared by the exact parser and the prose scanner so both
 * agree on which links are valid and where they point.
 */
export function buildWikilink(
  publisher: string,
  type: string,
  slug: string,
  section?: string | null,
  label?: string | null
): ParsedWikilink | null {
  if (type !== "articles" && type !== "books" && type !== "objects") return null;
  // A section only means something inside a book: `[[pub:articles:a:b]]` is not
  // a link, so leave it as literal text rather than inventing a URL.
  if (section && type !== "books") return null;

  const href = section
    ? `/${publisher}/books/${slug}/${section}`
    : `/${publisher}/${type}/${slug}`;

  return {
    publisher,
    type,
    slug,
    section: section ?? null,
    label: label ?? null,
    href,
    display: label ?? section ?? slug,
  };
}

/**
 * Renders a wikilink as authors type it — the inverse of `parseWikilink`.
 *
 * Lives here so the copy-to-clipboard affordances emit exactly what the parser
 * accepts; `tests/lib/wikilink-syntax.test.ts` asserts the round trip.
 */
export function formatWikilink(parts: {
  publisher: string;
  type: ParsedWikilink["type"];
  slug: string;
  section?: string | null;
}): string {
  const tail = parts.section ? `:${parts.section}` : "";
  return `[[${parts.publisher}:${parts.type}:${parts.slug}${tail}]]`;
}

/** Parses a string that should be exactly one wikilink; null when it isn't. */
export function parseWikilink(text: string): ParsedWikilink | null {
  const m = EXACT_RE.exec(text);
  if (!m) return null;
  const [, publisher, type, slug, section, label] = m;
  return buildWikilink(publisher, type, slug, section, label);
}
