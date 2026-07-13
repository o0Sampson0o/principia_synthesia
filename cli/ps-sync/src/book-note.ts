import { createHash } from "node:crypto";
import matter from "gray-matter";
import type { RemoteBook } from "./api";

/**
 * Book index files are editable: the user reorders chapter lines and moves
 * them under `## Part` headings, then `push` applies the new order + part
 * groupings. Chapters cannot be added/removed here (that stays in the web UI).
 *
 * Layout (markdown link style):
 *   # Book Title
 *   ## Part One
 *   1. [Chapter Title](../articles/article-slug.md)
 *   2. [Another](../articles/article-two.md)
 *   ## Part Two
 *   3. ...
 */

export interface ParsedBookNote {
  chapters: { articleSlug: string; partTitle: string | null }[];
}

const PART_RE = /^##\s+(.+?)\s*$/;
/** Sentinel heading for chapters with no part, when they follow a named part. */
const NO_PART_HEADING = "(no part)";
// list line: optional number/bullet, then a link to ../articles/<slug>.<ext>
// markdown form: [Label](../articles/slug.md) · wikilink form: [[slug|Label]]
const MD_LINK_RE = /\[[^\]]*\]\(\.\.\/articles\/([a-z0-9-]+)\.[a-z]+\)/;
const WIKI_LINK_RE = /\[\[([a-z0-9-]+)(?:\|[^\]]*)?\]\]/;

/** Parse an edited book index file back into an ordered chapter list. */
export function parseBookNote(content: string): ParsedBookNote {
  let body = content;
  try {
    body = matter(content).content;
  } catch {
    // use raw content on malformed frontmatter
  }

  const chapters: { articleSlug: string; partTitle: string | null }[] = [];
  let currentPart: string | null = null;

  for (const line of body.split(/\r?\n/)) {
    const partMatch = PART_RE.exec(line);
    if (partMatch) {
      currentPart = partMatch[1] === NO_PART_HEADING ? null : partMatch[1];
      continue;
    }
    const link = MD_LINK_RE.exec(line) ?? WIKI_LINK_RE.exec(line);
    if (link) {
      chapters.push({ articleSlug: link[1], partTitle: currentPart });
    }
  }
  return { chapters };
}

/**
 * Hash of a parsed book structure (ordered slug + partTitle) for local
 * change detection — the same recipe the server uses for its structureHash,
 * so a clean pulled file hashes to the value the server reported.
 */
export function structureLocalHash(
  chapters: { articleSlug: string; partTitle: string | null }[]
): string {
  const canonical = JSON.stringify(
    chapters.map((c) => [c.articleSlug, c.partTitle ?? ""])
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/** Render a book's structure as an editable index file. */
export function renderBookNote(
  book: RemoteBook,
  linkStyle: "markdown" | "wikilink",
  ext: string
): string {
  const lines: string[] = [
    `# ${book.title}`,
    "",
    "<!-- Reorder chapters and move them under ## Part headings, then ps-sync push.",
    "     Add/remove chapters in the web UI. -->",
    "",
  ];
  // `undefined` = "before any heading"; distinct from an explicit null part.
  let currentPart: string | null | undefined = undefined;
  let n = 0;
  for (const ch of book.chapters) {
    if (ch.partTitle !== currentPart) {
      currentPart = ch.partTitle;
      // A null part after a named part needs an explicit marker so it doesn't
      // silently inherit the preceding heading on re-parse. A null part at the
      // very top needs no heading at all.
      if (currentPart !== null) lines.push(`## ${currentPart}`, "");
      else if (n > 0) lines.push(`## ${NO_PART_HEADING}`, "");
    }
    n += 1;
    const link =
      linkStyle === "wikilink"
        ? `[[${ch.articleSlug}|${ch.title}]]`
        : `[${ch.title}](../articles/${ch.articleSlug}.${ext})`;
    lines.push(`${n}. ${link}`);
  }
  lines.push("");
  return lines.join("\n");
}
