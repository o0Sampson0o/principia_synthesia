import type { ArticleMetadata } from "@/lib/validations";

/**
 * Client-safe frontmatter parse/serialize for the editor. Kept in sync with the
 * server `serializeFrontmatter`/`parseFrontmatter` (`lib/frontmatter.ts`) but
 * without pulling in gray-matter. This is the single serialization the editor
 * uses to recombine the Frontmatter panel's metadata with the body — the panel
 * is the source of truth, so the raw YAML never appears in the content editor.
 *
 * The frontmatter model is closed: exactly status / tags / description / canvas.
 */
const DEFAULTS: ArticleMetadata = {
  status: "published",
  tags: [],
  description: "",
  canvas: null,
};
const STATUSES = ["published", "draft", "review", "archived"] as const;

export function parseFrontmatterClient(mdx: string): {
  metadata: ArticleMetadata;
  body: string;
} {
  if (!mdx.startsWith("---")) return { metadata: { ...DEFAULTS }, body: mdx };
  const end = mdx.indexOf("\n---", 3);
  if (end === -1) return { metadata: { ...DEFAULTS }, body: mdx };

  const yamlBlock = mdx.slice(3, end).trim();
  const body = mdx.slice(end + 4).trimStart();
  const meta: Partial<ArticleMetadata> = {};
  for (const line of yamlBlock.split("\n")) {
    const [key, ...rest] = line.split(":");
    const val = rest.join(":").trim();
    const k = key?.trim();
    if (k === "status" && STATUSES.includes(val as ArticleMetadata["status"])) {
      meta.status = val as ArticleMetadata["status"];
    } else if (k === "tags") {
      try {
        meta.tags = JSON.parse(val);
      } catch {
        meta.tags = [];
      }
    } else if (k === "description") {
      try {
        meta.description = JSON.parse(val);
      } catch {
        meta.description = val;
      }
    } else if (k === "canvas") {
      meta.canvas = val === "null" ? null : val || null;
    }
  }
  return { metadata: { ...DEFAULTS, ...meta }, body };
}

/** The `---…---` block (no trailing newline), matching the server format. */
export function serializeFrontmatterBlock(metadata: ArticleMetadata): string {
  const tags = JSON.stringify(metadata.tags.map((t) => t.toLowerCase()));
  const desc = JSON.stringify(metadata.description);
  const canvas = metadata.canvas === null ? "null" : metadata.canvas;
  return `---\nstatus: ${metadata.status}\ntags: ${tags}\ndescription: ${desc}\ncanvas: ${canvas}\n---`;
}

/** Full stored content = frontmatter block + blank line + body. Mirrors `serializeFrontmatter`. */
export function assembleContent(metadata: ArticleMetadata, body: string): string {
  return `${serializeFrontmatterBlock(metadata)}\n\n${body.trimStart()}`;
}
