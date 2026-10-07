import GithubSlugger from "github-slugger";
import katex from "katex";
import type { KatexMacros } from "@/lib/katex-macros";

export interface TocEntry {
  depth: 1 | 2 | 3;
  text: string;
  id: string;
  /**
   * The heading with its inline `$…$` maths typeset, for headings that have
   * any. Rendered here, on the server, so the TOC components never ship KaTeX
   * to the browser; absent for plain headings, which render `text`.
   */
  html?: string;
}

const INLINE_MATH = /\$([^$\n]+?)\$/;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Typesets a heading's inline maths, leaving the prose around it as plain
 * (escaped, markdown-stripped) text. Null when the heading has no maths.
 * KaTeX escapes its own output and runs untrusted (no \href, \url), so the
 * result is safe to inject.
 */
function headingHtml(raw: string, macros: KatexMacros): string | null {
  const parts = raw.replace(/\s+#+\s*$/, "").split(INLINE_MATH);
  if (parts.length === 1) return null;
  // split() with a capture group alternates prose, tex, prose, tex, … prose.
  return parts
    .map((part, i) =>
      i % 2 === 1
        ? // Copy: KaTeX writes \gdef definitions back into the macros object.
          katex.renderToString(part, { throwOnError: false, macros: { ...macros } })
        : // Prose between maths keeps its spaces; cleanInline would trim them.
          escapeHtml(stripInlineMarkup(part))
    )
    .join("")
    .trim();
}

/** Strip inline markdown syntax, keeping surrounding whitespace. */
function stripInlineMarkup(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2") // [[slug|Label]] → Label
    .replace(/\[\[([^\]]+)\]\]/g, "$1") // [[slug]] → slug
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) → text
    .replace(/[*_~`]/g, "");
}

/** Strip inline markdown syntax so the TOC shows plain heading text. */
function cleanInline(s: string): string {
  return stripInlineMarkup(s)
    .replace(/\s+#+\s*$/, "") // trailing closing hashes
    .trim();
}

/**
 * Extracts `#`–`###` headings from a markdown body for the table of contents,
 * skipping fenced code blocks. Ids come from github-slugger — the same
 * algorithm rehype-slug applies to the rendered headings, so TOC links land
 * on the anchors the page actually renders.
 *
 * CRLF is normalised first: `.` and `$` both treat a bare `\r` as a line
 * terminator, so a CRLF body (anything synced from a Windows editor) would
 * otherwise match no headings at all.
 */
export function extractToc(body: string, macros: KatexMacros = {}): TocEntry[] {
  const slugger = new GithubSlugger();
  const entries: TocEntry[] = [];
  let fenceMarker: string | null = null;

  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (fenceMarker === null) fenceMarker = fence[1][0];
      else if (fence[1][0] === fenceMarker) fenceMarker = null;
      continue;
    }
    if (fenceMarker !== null) continue;

    const m = line.match(/^(#{1,3})\s+(.+)$/);
    if (!m) continue;
    const text = cleanInline(m[2]);
    if (!text) continue;
    const html = headingHtml(m[2], macros);
    entries.push({
      depth: m[1].length as 1 | 2 | 3,
      text,
      id: slugger.slug(text),
      ...(html ? { html } : {}),
    });
  }

  return entries;
}
