import matter from "gray-matter";
import { articleMetadataSchema, type ArticleMetadata } from "@/lib/validations";

export const DEFAULT_ARTICLE_METADATA: ArticleMetadata = {
  status: "published",
  tags: [],
  description: "",
  canvas: null,
};

/**
 * Parse a YAML frontmatter block off the front of an MDX string.
 * - Returns the parsed metadata (with defaults filled in) and the remaining body.
 * - If no frontmatter block is present, returns DEFAULT_ARTICLE_METADATA and the
 *   original string as `body`.
 * - If the YAML block is malformed, returns DEFAULT_ARTICLE_METADATA and the
 *   original string as `body` (parser does not throw — frontmatter parsing must
 *   never break article rendering).
 */
export function parseFrontmatter(mdx: string): { metadata: ArticleMetadata; body: string } {
  // If there's no frontmatter delimiter, return defaults immediately
  if (!mdx.startsWith("---")) {
    return { metadata: DEFAULT_ARTICLE_METADATA, body: mdx };
  }

  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(mdx);
  } catch {
    return { metadata: DEFAULT_ARTICLE_METADATA, body: mdx };
  }

  const validation = articleMetadataSchema.safeParse(parsed.data);
  const metadata = validation.success ? validation.data : DEFAULT_ARTICLE_METADATA;

  // gray-matter puts the body (without frontmatter) in `.content`
  const body = parsed.content.trimStart();

  return { metadata, body };
}

/**
 * Reconstruct an MDX string with a frontmatter block at the top.
 * - Always emits all four canonical fields in a fixed order.
 * - Empty `tags` array and empty `description` are still emitted so the editor
 *   round-trips predictably.
 * - `canvas: null` is emitted as `canvas: null` (not omitted).
 * - Uses JSON-flow style for tags and description so gray-matter parses it back
 *   losslessly. Hand-rolled to produce deterministic output (no js-yaml block style).
 */
export function serializeFrontmatter(metadata: ArticleMetadata, body: string): string {
  // Lowercase tags as a final pass even if Zod already did — defense in depth
  const tags = metadata.tags.map((t) => t.toLowerCase());
  const tagsStr = JSON.stringify(tags);
  const descStr = JSON.stringify(metadata.description);
  const canvasStr = metadata.canvas === null ? "null" : metadata.canvas;

  const frontmatter = [
    "---",
    `status: ${metadata.status}`,
    `tags: ${tagsStr}`,
    `description: ${descStr}`,
    `canvas: ${canvasStr}`,
    "---",
  ].join("\n");

  return `${frontmatter}\n\n${body.trimStart()}`;
}
