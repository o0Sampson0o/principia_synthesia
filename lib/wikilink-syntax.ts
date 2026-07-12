/**
 * Single source of truth for the wikilink syntax
 * `[[publisher:type:slug]]` / `[[publisher:type:slug|Label]]`.
 * Consumed by the remark transform (publish pipeline), the editor's Lezer
 * parser, and the live-preview chip widget.
 */

/** Global-flags instance for scanning prose. Create locals via `wikilinkRe()`. */
export const WIKILINK_SOURCE =
  "\\[\\[([a-z0-9-]+):(articles|books|objects):([a-z0-9-]+)(?:\\|([^\\]]+))?\\]\\]";

export function wikilinkRe(): RegExp {
  return new RegExp(WIKILINK_SOURCE, "g");
}

const EXACT_RE = new RegExp(`^${WIKILINK_SOURCE}$`);

export interface ParsedWikilink {
  publisher: string;
  type: "articles" | "books" | "objects";
  slug: string;
  label: string | null;
  href: string;
  /** What a reader should see: the label when present, else the slug. */
  display: string;
}

/** Parses a string that should be exactly one wikilink; null when it isn't. */
export function parseWikilink(text: string): ParsedWikilink | null {
  const m = EXACT_RE.exec(text);
  if (!m) return null;
  const [, publisher, type, slug, label] = m;
  return {
    publisher,
    type: type as ParsedWikilink["type"],
    slug,
    label: label ?? null,
    href: `/${publisher}/${type}/${slug}`,
    display: label ?? slug,
  };
}
