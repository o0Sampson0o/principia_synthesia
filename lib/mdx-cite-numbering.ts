import { extractCitationSlugs } from "@/lib/citations-extract";

export interface CitationIndex {
  /** Maps each <Cite slug="..."/> slug to its 1-based display number. */
  slugToNumber: Map<string, number>;
  /** Ordered list of slugs in first-appearance order. */
  orderedSlugs: string[];
}

/**
 * Scan MDX source for <Cite slug="..."/> elements and assign deterministic
 * 1-based citation numbers in first-appearance order.
 *
 * Pure function — no DB calls, no side effects.
 */
export function buildCitationIndex(mdx: string): CitationIndex {
  const orderedSlugs = extractCitationSlugs(mdx);
  const slugToNumber = new Map<string, number>();
  orderedSlugs.forEach((slug, i) => slugToNumber.set(slug, i + 1));
  return { slugToNumber, orderedSlugs };
}
