/**
 * A short passage of an article body around a search match, so a result shows
 * WHY it matched — the excerpt a reader skims before choosing, which plain
 * ILIKE search could not give.
 *
 * Returned as plain segments, never HTML: the result page wraps `match` in a
 * <mark> itself, so nothing from article content is ever injected.
 */
export interface SearchExcerpt {
  before: string;
  match: string;
  after: string;
}

/** Characters of context on each side of the match. */
const CONTEXT = 90;

/**
 * Markdown to the text a reader sees, near enough for an excerpt: frontmatter,
 * fenced code and macro blocks, link/wikilink/image syntax, emphasis markers and
 * heading hashes go; inline and display maths keep their TeX (it is the text
 * the author wrote, and often exactly what was searched for).
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?\n\1[^\n]*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>+(\s*\[![^\]]*\][+-]?)?|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~|`)/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The first case-insensitive occurrence of `query` in the body's plain text,
 * with up to CONTEXT characters either side, cut back to word boundaries and
 * marked with an ellipsis where the passage was cut. Null when the body does
 * not contain the query (the match was in the title or summary).
 */
export function searchExcerpt(markdown: string, query: string): SearchExcerpt | null {
  const q = query.trim();
  if (!q) return null;
  const text = plainText(markdown);
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at === -1) return null;

  let start = Math.max(0, at - CONTEXT);
  let end = Math.min(text.length, at + q.length + CONTEXT);
  // Do not open or close mid-word.
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) > at + q.length ? text.lastIndexOf(" ", end) : end;

  return {
    before: (start > 0 ? "…" : "") + text.slice(start, at),
    match: text.slice(at, at + q.length),
    after: text.slice(at + q.length, end) + (end < text.length ? "…" : ""),
  };
}
