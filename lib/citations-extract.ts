/**
 * Regex-based extraction of <Cite slug="..."/> references from MDX source.
 * Runs on every save — cheap enough that we don't need a full MDX parse.
 *
 * Matches both self-closing (`<Cite slug="..." />`) and paired (`<Cite slug="..."></Cite>`)
 * forms, with any attribute whitespace.
 */
const CITE_RE = /<Cite\b[^>]*\bslug\s*=\s*["']([^"']+)["'][^>]*\/?>/g;

/**
 * Extract all <Cite slug="..."/> slugs from an MDX string.
 * Deduplicates while preserving first-appearance order.
 *
 * @returns Array of unique slugs in first-appearance order.
 */
export function extractCitationSlugs(mdx: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  // Reset lastIndex each call (regex is module-level and stateful)
  CITE_RE.lastIndex = 0;
  while ((m = CITE_RE.exec(mdx)) !== null) {
    const slug = m[1].trim();
    if (!seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}
