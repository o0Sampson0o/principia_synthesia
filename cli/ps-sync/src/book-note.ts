import { createHash } from "node:crypto";
import matter from "gray-matter";
import type { RemoteBook } from "./api";

/**
 * Book index files are editable: the user reorders section lines and moves
 * them under `## Part` and `### Chapter` headings, then `push` applies the new
 * order + Part/Chapter groupings. Sections cannot be added/removed here (that
 * stays in the web UI).
 *
 * Layout (markdown link style):
 *   # Book Title
 *   ## Part One
 *   ### Chapter One
 *   1. [Section Title](../articles/article-slug.md)
 *   2. [Another](../articles/article-two.md)
 *   ### Chapter Two
 *   3. ...
 *   ## Part Two
 *   4. ...
 *
 * Both grouping levels are positional markers de-duped on render (a heading is
 * emitted only when the value changes between consecutive sections) and
 * inherited on parse, so a value that returns to "none" is written as an
 * explicit `(no part)` / `(no chapter)` sentinel to avoid a silent inherit.
 */

export interface ParsedBookNote {
  sections: { articleSlug: string; partTitle: string | null; chapterTitle: string | null }[];
}

const CHAPTER_RE = /^###\s+(.+?)\s*$/;
const PART_RE = /^##\s+(.+?)\s*$/;
/** Sentinel headings that reset a grouping level back to "none". */
const NO_PART_HEADING = "(no part)";
const NO_CHAPTER_HEADING = "(no chapter)";
// list line: optional number/bullet, then a link to ../articles/<slug>.<ext>
// markdown form: [Label](../articles/slug.md) · wikilink form: [[slug|Label]]
const MD_LINK_RE = /\[[^\]]*\]\(\.\.\/articles\/([a-z0-9-]+)\.[a-z]+\)/;
const WIKI_LINK_RE = /\[\[([a-z0-9-]+)(?:\|[^\]]*)?\]\]/;

/** Parse an edited book index file back into an ordered section list. */
export function parseBookNote(content: string): ParsedBookNote {
  let body = content;
  try {
    body = matter(content).content;
  } catch {
    // use raw content on malformed frontmatter
  }

  const sections: ParsedBookNote["sections"] = [];
  let currentPart: string | null = null;
  let currentChapter: string | null = null;

  for (const line of body.split(/\r?\n/)) {
    // Check the deeper heading level first (### before ##).
    const chapterMatch = CHAPTER_RE.exec(line);
    if (chapterMatch) {
      currentChapter = chapterMatch[1] === NO_CHAPTER_HEADING ? null : chapterMatch[1];
      continue;
    }
    const partMatch = PART_RE.exec(line);
    if (partMatch) {
      currentPart = partMatch[1] === NO_PART_HEADING ? null : partMatch[1];
      continue;
    }
    const link = MD_LINK_RE.exec(line) ?? WIKI_LINK_RE.exec(line);
    if (link) {
      sections.push({ articleSlug: link[1], partTitle: currentPart, chapterTitle: currentChapter });
    }
  }
  return { sections };
}

/**
 * Hash of a parsed book structure (ordered slug + partTitle + chapterTitle) for
 * local change detection — the same recipe the server uses for its
 * structureHash, so a clean pulled file hashes to the value the server reported.
 */
export function structureLocalHash(
  sections: { articleSlug: string; partTitle: string | null; chapterTitle: string | null }[]
): string {
  const canonical = JSON.stringify(
    sections.map((s) => [s.articleSlug, s.partTitle ?? "", s.chapterTitle ?? ""])
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
    "<!-- Reorder sections and move them under ## Part / ### Chapter headings, then ps-sync push.",
    "     Add/remove sections in the web UI. -->",
    "",
  ];
  // `undefined` = "before any heading"; distinct from an explicit null group.
  let currentPart: string | null | undefined = undefined;
  let currentChapter: string | null | undefined = undefined;
  let n = 0;
  for (const s of book.sections) {
    if (s.partTitle !== currentPart) {
      currentPart = s.partTitle;
      // A null group after a named one needs an explicit sentinel so it doesn't
      // silently inherit the preceding heading on re-parse. A null group at the
      // very top needs no heading at all.
      if (currentPart !== null) lines.push(`## ${currentPart}`, "");
      else if (n > 0) lines.push(`## ${NO_PART_HEADING}`, "");
    }
    if (s.chapterTitle !== currentChapter) {
      currentChapter = s.chapterTitle;
      if (currentChapter !== null) lines.push(`### ${currentChapter}`, "");
      else if (n > 0) lines.push(`### ${NO_CHAPTER_HEADING}`, "");
    }
    n += 1;
    const link =
      linkStyle === "wikilink"
        ? `[[${s.articleSlug}|${s.title}]]`
        : `[${s.title}](../articles/${s.articleSlug}.${ext})`;
    lines.push(`${n}. ${link}`);
  }
  lines.push("");
  return lines.join("\n");
}
