/**
 * Book outline editing — the pure half (no DB, safe to import client-side).
 *
 * The outline editor holds a book's whole curriculum as one ordered list and
 * saves it in a single batch. `curriculumEntries` is flat and positional (see
 * lib/book-structure.ts), so the outline is too: each item is a Part divider,
 * a Chapter divider, or a section, and nesting is implied by order.
 *
 *   parseOutline     pasted text (markdown headings, nested lists, a copied
 *                    table of contents) → outline items
 *   planOutlineSave  the client's desired outline vs. the saved rows → the
 *                    writes to make, or an error. The server action is a thin
 *                    transactional wrapper around this plan.
 */
import { prefixedSlug, uniqueSlug } from "@/lib/slugify";

export type OutlineKind = "part" | "chapter" | "section";
export type DividerKind = "part" | "chapter";

/** One item of the outline the editor submits, in final order. */
export type OutlineItem =
  /** A Part/Chapter divider; `entryId` when it already exists (title may change). */
  | { kind: DividerKind; entryId?: number; title: string }
  /** An existing section entry, kept in place. */
  | { kind: "section"; entryId: number }
  /** One of the publisher's standalone articles, added to the book. */
  | { kind: "section"; articleId: number }
  /** A new book-internal section, created from its title alone. */
  | { kind: "section"; title: string };

export const OUTLINE_TITLE_MAX = 200;
export const OUTLINE_MAX_ITEMS = 1000;

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/** The slug a new section titled `title` gets, before in-book de-duplication. */
export function sectionSlugBase(title: string): string {
  return prefixedSlug("article-", title, "section");
}

// ---------------------------------------------------------------------------
// Pasted outline → items
// ---------------------------------------------------------------------------

export interface ParsedOutlineItem {
  kind: OutlineKind;
  title: string;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^([-*+]|\d+[.)])\s+(.*)$/;
// "Part II", "Part 3:", "Chapter one —" — a numeral, not any word ("Part of…").
const NUMERAL = String.raw`(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)(?=$|[\s:.\-–—])`;
const PART_WORD = new RegExp(String.raw`^part\s+${NUMERAL}`, "i");
const CHAPTER_WORD = new RegExp(String.raw`^chapter\s+${NUMERAL}`, "i");

/** Strip list/link/checkbox decoration a copied TOC tends to carry. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/^\[[ xX]\]\s+/, "") // task-list checkbox
    .replace(/^\[([^\]]*)\]\([^)]*\)$/, "$1") // [Title](path) — mdBook SUMMARY.md style
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, OUTLINE_TITLE_MAX);
}

interface Line {
  indent: number; // indentation rank among the list's distinct indent widths
  heading: number; // 1–6 for a markdown heading, 0 otherwise
  title: string;
}

/**
 * Turn pasted text into outline items. Accepted, freely mixed:
 *  - Markdown headings: `#` → Part, `##` → Chapter, `###`+ → section.
 *  - Lists or indented lines: leaves are sections; an item with children is a
 *    Chapter, or a Part when its children have children of their own.
 *  - Explicit words win over structure: "Part II …" is a Part and
 *    "Chapter 3 …" a Chapter wherever they sit.
 * Blank lines are ignored. Never throws; unparseable text yields sections.
 */
export function parseOutline(text: string): ParsedOutlineItem[] {
  const rawLines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (rawLines.length === 0) return [];

  // Indentation → rank, so 2-space, 4-space and tab lists all nest the same.
  const widthOf = (l: string) => {
    const lead = l.match(/^[ \t]*/)![0];
    return lead.replace(/\t/g, "    ").length;
  };
  const widths = [...new Set(rawLines.map(widthOf))].sort((a, b) => a - b);

  const lines: Line[] = rawLines.map((l) => {
    const body = l.trim();
    const h = body.match(HEADING);
    if (h) return { indent: 0, heading: h[1].length, title: cleanTitle(h[2]) };
    const li = body.match(LIST_ITEM);
    return { indent: widths.indexOf(widthOf(l)), heading: 0, title: cleanTitle(li ? li[2] : body) };
  });

  // Subtree height of each non-heading line within its run of list lines:
  // 0 = leaf, 1 = has children, 2+ = has grandchildren.
  const height = new Array<number>(lines.length).fill(0);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].heading) continue;
    // Every descendant is visited; a deeper one only ever under-counts, so
    // the max is set by the direct children (already computed, bottom-up).
    for (let j = i + 1; j < lines.length && !lines[j].heading && lines[j].indent > lines[i].indent; j++) {
      height[i] = Math.max(height[i], height[j] + 1);
    }
  }

  const out: ParsedOutlineItem[] = [];
  lines.forEach((line, i) => {
    if (!line.title) return;
    let kind: OutlineKind;
    if (PART_WORD.test(line.title)) kind = "part";
    else if (CHAPTER_WORD.test(line.title)) kind = "chapter";
    else if (line.heading === 1) kind = "part";
    else if (line.heading === 2) kind = "chapter";
    else if (line.heading >= 3) kind = "section";
    else if (height[i] >= 2) kind = "part";
    else if (height[i] === 1) kind = "chapter";
    else kind = "section";
    out.push({ kind, title: line.title });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Save planning
// ---------------------------------------------------------------------------

/** A curriculum row as saved, in position order. */
export interface SavedOutlineRow {
  entryId: number;
  /** null for divider rows. */
  articleId: number | null;
  kind: OutlineKind;
  /** Divider label (dividers only). */
  title: string | null;
  /** Section's article is book-internal: removing the entry deletes the article. */
  isInternal: boolean;
}

/** One row of the saved result, in final order. */
export type PlannedRow =
  | { op: "keep"; entryId: number }
  | { op: "new-divider"; kind: DividerKind; title: string }
  | { op: "new-section"; title: string; slug: string }
  | { op: "add-article"; articleId: number };

export interface OutlinePlan {
  rows: PlannedRow[];
  renames: { entryId: number; title: string; kind: DividerKind }[];
  /** Entries to remove; `deleteArticleId` set when the article is internal. */
  removals: { entryId: number; deleteArticleId: number | null }[];
}

/**
 * Validate the submitted outline against the saved rows and work out the
 * writes. `baseIds` is the entry order the editor started from — if the book
 * changed since (another tab, the sync API), the save is refused rather than
 * silently overwriting it. `takenSlugs` holds every slug a new section must
 * avoid (all of this book's internal articles, binned ones included, plus
 * every article already in the book); it is extended in place.
 */
export function planOutlineSave(input: {
  saved: SavedOutlineRow[];
  baseIds: number[];
  items: OutlineItem[];
  takenSlugs: Set<string>;
}): OutlinePlan | { error: string } {
  const { saved, baseIds, items, takenSlugs } = input;

  const savedIds = saved.map((r) => r.entryId);
  if (savedIds.length !== baseIds.length || savedIds.some((id, i) => id !== baseIds[i])) {
    return { error: "This book's contents changed since you opened the editor. Reload to see the latest, then redo your edits." };
  }
  if (items.length > OUTLINE_MAX_ITEMS) {
    return { error: `A book outline can hold at most ${OUTLINE_MAX_ITEMS} entries.` };
  }

  const byId = new Map(saved.map((r) => [r.entryId, r]));
  const keptIds = new Set<number>();
  const articleIdsInBook = new Set<number>();
  const rows: PlannedRow[] = [];
  const renames: OutlinePlan["renames"] = [];

  // Articles kept in the book, so adding one twice is caught regardless of order.
  for (const item of items) {
    if ("entryId" in item && item.entryId !== undefined) {
      const row = byId.get(item.entryId);
      if (row?.articleId != null) articleIdsInBook.add(row.articleId);
    }
  }

  for (const item of items) {
    if (item.kind === "section" && "entryId" in item) {
      const row = byId.get(item.entryId);
      if (!row || row.kind !== "section") return { error: "The outline refers to a section that is not in this book." };
      if (keptIds.has(item.entryId)) return { error: "A section appears twice in the outline." };
      keptIds.add(item.entryId);
      rows.push({ op: "keep", entryId: item.entryId });
    } else if (item.kind === "section" && "articleId" in item) {
      if (articleIdsInBook.has(item.articleId)) return { error: "That article is already in this book." };
      articleIdsInBook.add(item.articleId);
      rows.push({ op: "add-article", articleId: item.articleId });
    } else if (item.kind === "section") {
      const title = item.title.trim();
      if (!title) return { error: "Every new section needs a title." };
      rows.push({ op: "new-section", title, slug: uniqueSlug(sectionSlugBase(title), takenSlugs) });
    } else {
      const title = item.title.trim();
      if (!title) return { error: `Every ${item.kind} needs a title.` };
      if (item.entryId === undefined) {
        rows.push({ op: "new-divider", kind: item.kind, title });
        continue;
      }
      const row = byId.get(item.entryId);
      if (!row || row.kind === "section") return { error: "The outline refers to a part or chapter that is not in this book." };
      if (keptIds.has(item.entryId)) return { error: "A part or chapter appears twice in the outline." };
      keptIds.add(item.entryId);
      if (title !== row.title || item.kind !== row.kind) {
        renames.push({ entryId: item.entryId, title, kind: item.kind });
      }
      rows.push({ op: "keep", entryId: item.entryId });
    }
  }

  const removals = saved
    .filter((r) => !keptIds.has(r.entryId))
    .map((r) => ({
      entryId: r.entryId,
      deleteArticleId: r.kind === "section" && r.isInternal ? r.articleId : null,
    }));

  return { rows, renames, removals };
}
