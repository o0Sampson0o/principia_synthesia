import { createHash } from "node:crypto";
import matter from "gray-matter";

/**
 * Pure content helpers for ps-sync.
 *
 * Two constraints drive everything here:
 *
 * 1. Many markdown editors rewrite YAML frontmatter formatting when metadata
 *    is edited through their UI (Obsidian's Properties panel, for example,
 *    turns flow-style arrays into block style and normalises quoting), so
 *    change detection must compare parsed values, not bytes → `semanticHash`.
 * 2. The server stores article content verbatim, so the local-only `ps-id`
 *    identity key must be stripped before pushing → `stripPsId`/`injectPsId`.
 */

export const PS_ID_KEY = "ps-id";

const CANONICAL_KEYS = ["status", "tags", "description", "canvas"] as const;
const VALID_STATUSES = ["draft", "review", "published", "archived"] as const;
const CANVAS_RE = /^anim-[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// ps-id injection / stripping
// ---------------------------------------------------------------------------

/** Matches the whole first frontmatter block including delimiters. */
const FRONTMATTER_BLOCK_RE = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

/**
 * Inserts `ps-id: <id>` as the first line of the frontmatter block, creating
 * a block when the content has none. Any existing ps-id line is replaced.
 */
export function injectPsId(content: string, id: number): string {
  const { content: without } = stripPsId(content);
  const match = without.match(FRONTMATTER_BLOCK_RE);
  if (!match) {
    return `---\n${PS_ID_KEY}: ${id}\n---\n\n${without}`;
  }
  return without.replace(FRONTMATTER_BLOCK_RE, (_m, inner: string, tail: string) => {
    return `---\n${PS_ID_KEY}: ${id}\n${inner}\n---${tail}`;
  });
}

/**
 * Removes the ps-id line from the first frontmatter block, byte-preserving
 * everything else. Returns the extracted id (or null).
 */
export function stripPsId(content: string): { content: string; psId: number | null } {
  const match = content.match(FRONTMATTER_BLOCK_RE);
  if (!match) return { content, psId: null };

  const inner = match[1];
  const lines = inner.split(/\r?\n/);
  let psId: number | null = null;
  const kept: string[] = [];
  for (const line of lines) {
    const m = line.match(new RegExp(`^${PS_ID_KEY}:\\s*(\\d+)\\s*$`));
    if (m && psId === null) {
      psId = Number(m[1]);
    } else {
      kept.push(line);
    }
  }
  if (psId === null) return { content, psId: null };

  const tail = match[2] ?? "";
  const rebuilt =
    kept.length === 0
      ? // ps-id was the only key: drop the whole block plus the blank line
        // injectPsId added after it
        content.slice(match[0].length).replace(/^\r?\n/, "")
      : `---\n${kept.join("\n")}\n---${tail}` + content.slice(match[0].length);
  return { content: rebuilt, psId };
}

/** Reads the ps-id from a file's frontmatter without modifying anything. */
export function readPsId(content: string): number | null {
  return stripPsId(content).psId;
}

// ---------------------------------------------------------------------------
// Semantic hashing (editor-reformat-proof change detection)
// ---------------------------------------------------------------------------

/**
 * Mirrors the server's articleMetadataSchema semantics (lib/validations.ts):
 * returns the normalized canonical metadata, or null when any canonical field
 * is invalid — in which case the server would fall back to defaults wholesale.
 */
export function normalizeCanonicalMetadata(
  data: Record<string, unknown>
): { status: string; tags: string[]; description: string; canvas: string | null } | null {
  const status = data.status === undefined ? "published" : data.status;
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as never)) return null;

  const tags: string[] = [];
  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) return null;
    if (data.tags.length > 20) return null;
    for (const t of data.tags) {
      if (typeof t !== "string") return null;
      const trimmed = t.trim().toLowerCase();
      if (trimmed.length < 1 || trimmed.length > 50) return null;
      tags.push(trimmed);
    }
  }

  const description = data.description === undefined ? "" : data.description;
  if (typeof description !== "string" || description.length > 300) return null;

  let canvas: string | null = null;
  if (data.canvas !== undefined && data.canvas !== null) {
    if (typeof data.canvas !== "string" || !CANVAS_RE.test(data.canvas)) return null;
    canvas = data.canvas;
  }

  return { status, tags, description, canvas };
}

/**
 * Content hash that is stable across YAML reformatting but changes whenever
 * the parsed frontmatter values or the body change. Callers should strip
 * ps-id first when hashing local files.
 */
export function semanticHash(content: string): string {
  let data: Record<string, unknown>;
  let body: string;
  try {
    const parsed = matter(content);
    data = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch {
    // Malformed YAML: fall back to hashing the raw text so edits still count.
    return createHash("sha256").update(`raw\0${content}`).digest("hex");
  }

  const canonical = normalizeCanonicalMetadata(data);
  const extraKeys = Object.keys(data)
    .filter((k) => !CANONICAL_KEYS.includes(k as never))
    .sort();
  const extras = extraKeys.map((k) => [k, data[k]]);

  const payload = JSON.stringify({ canonical, extras }) + "\0" + body.trim();
  return createHash("sha256").update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// Frontmatter validation (pre-push warning)
// ---------------------------------------------------------------------------

/**
 * Checks whether the frontmatter would survive the server's schema. When it
 * wouldn't, the server silently resets the article's metadata mirror to
 * defaults — worth a loud warning before push.
 */
export function validateFrontmatter(content: string): { valid: boolean; problem: string | null } {
  if (!content.startsWith("---")) return { valid: true, problem: null };
  let data: Record<string, unknown>;
  try {
    data = matter(content).data as Record<string, unknown>;
  } catch {
    return { valid: false, problem: "frontmatter YAML does not parse" };
  }
  if (normalizeCanonicalMetadata(data) === null) {
    return {
      valid: false,
      problem:
        "frontmatter fails the server schema (status/tags/description/canvas) — metadata would reset to defaults",
    };
  }
  return { valid: true, problem: null };
}

// ---------------------------------------------------------------------------
// New-article helpers
// ---------------------------------------------------------------------------

/** First `# Heading` in the body, else the filename without extension. */
export function deriveTitle(content: string, filename: string): string {
  let body = content;
  try {
    body = matter(content).content;
  } catch {
    // use raw content
  }
  const heading = body.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return filename.replace(/\.[^.]+$/, "");
}

/** Derives a valid `article-*` slug from a filename. */
export function slugFromFilename(filename: string): string {
  const base = filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = base.startsWith("article-") ? base : `article-${base}`;
  if (!/^article-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Cannot derive a valid slug from "${filename}"`);
  }
  return slug;
}
