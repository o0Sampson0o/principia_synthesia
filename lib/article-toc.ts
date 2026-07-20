import GithubSlugger from "github-slugger";

export interface TocEntry {
  depth: 1 | 2 | 3;
  text: string;
  id: string;
}

/** Strip inline markdown syntax so the TOC shows plain heading text. */
function cleanInline(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2") // [[slug|Label]] → Label
    .replace(/\[\[([^\]]+)\]\]/g, "$1") // [[slug]] → slug
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) → text
    .replace(/[*_~`]/g, "")
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
export function extractToc(body: string): TocEntry[] {
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
    entries.push({ depth: m[1].length as 1 | 2 | 3, text, id: slugger.slug(text) });
  }

  return entries;
}
