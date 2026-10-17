/**
 * Markdown "blocks" for the editor's block handle — what moves, duplicates or
 * deletes as one unit. Pure: works on an array of line strings, 0-based line
 * indices, inclusive ranges. No CodeMirror.
 *
 *  - a fenced block (``` / ~~~ / $$ / <details>…</details>) is one block, from
 *    its opening to its closing line;
 *  - a list item is its marker line plus any more-indented continuation lines;
 *  - a heading is its own line;
 *  - a table (`|` lines) and a quote/callout (`>` lines) are their runs;
 *  - anything else is a paragraph: the run of plain non-blank lines.
 * Blank lines belong to no block.
 */

export interface BlockRange {
  from: number;
  to: number;
}

const FENCE_RE = /^\s*(```+|~~~+|\$\$)/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s/;
const HEADING_RE = /^\s{0,3}#{1,6}\s/;
const isBlank = (l: string) => l.trim() === "";
const indentOf = (l: string) => l.match(/^\s*/)![0].replace(/\t/g, "    ").length;

/** Every fenced range in the document, so a line inside one is found in O(fences). */
export function fencedRanges(lines: string[]): BlockRange[] {
  const out: BlockRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const fence = FENCE_RE.exec(lines[i])?.[1];
    if (fence) {
      const marker = fence.startsWith("$") ? "$$" : fence;
      // A one-line $$…$$ closes itself.
      if (marker === "$$" && lines[i].trim().length > 2 && lines[i].trim().endsWith("$$")) {
        out.push({ from: i, to: i });
        continue;
      }
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith(marker)) j++;
      out.push({ from: i, to: Math.min(j, lines.length - 1) });
      i = j;
      continue;
    }
    if (/^\s*<details[\s>]/.test(lines[i])) {
      let depth = 0;
      let j = i;
      for (; j < lines.length; j++) {
        depth += (lines[j].match(/<details[\s>]/g) ?? []).length;
        depth -= (lines[j].match(/<\/details>/g) ?? []).length;
        if (depth <= 0) break;
      }
      out.push({ from: i, to: Math.min(j, lines.length - 1) });
      i = j;
    }
  }
  return out;
}

/** The block containing line `n`, or null for a blank line. */
export function blockAt(lines: string[], n: number, fences = fencedRanges(lines)): BlockRange | null {
  if (n < 0 || n >= lines.length) return null;
  const fenced = fences.find((r) => n >= r.from && n <= r.to);
  if (fenced) return fenced;
  if (isBlank(lines[n])) return null;
  const inFence = (i: number) => fences.some((r) => i >= r.from && i <= r.to);

  if (HEADING_RE.test(lines[n])) return { from: n, to: n };

  // List item: walk up to its marker line (a continuation belongs to it).
  let start = n;
  while (start > 0 && !LIST_RE.test(lines[start]) && indentOf(lines[start]) > 0 && !isBlank(lines[start - 1])) start--;
  if (LIST_RE.test(lines[start]) && (start === n || indentOf(lines[n]) > indentOf(lines[start]))) {
    const base = indentOf(lines[start]);
    let end = start;
    while (end + 1 < lines.length && !isBlank(lines[end + 1]) && !inFence(end + 1) && indentOf(lines[end + 1]) > base) end++;
    return { from: start, to: end };
  }

  const runOf = (test: (l: string) => boolean): BlockRange => {
    let from = n;
    let to = n;
    while (from > 0 && test(lines[from - 1]) && !inFence(from - 1)) from--;
    while (to + 1 < lines.length && test(lines[to + 1]) && !inFence(to + 1)) to++;
    return { from, to };
  };
  if (lines[n].trimStart().startsWith("|")) return runOf((l) => l.trimStart().startsWith("|"));
  if (lines[n].trimStart().startsWith(">")) return runOf((l) => l.trimStart().startsWith(">"));

  const plain = (l: string) =>
    !isBlank(l) && !HEADING_RE.test(l) && !LIST_RE.test(l) && !FENCE_RE.test(l) && !/^\s*[|>]/.test(l) && !/^\s*<\/?details/.test(l);
  return runOf(plain);
}

/**
 * Move block `b` so it starts at line `target` (an index in the ORIGINAL
 * lines, meaning "before this line"; `lines.length` = the end). Keeps the
 * block's blank-line separation from its new neighbours. Returns the new
 * lines and where the block now starts, or null when it would not move.
 */
export function moveBlock(lines: string[], b: BlockRange, target: number): { lines: string[]; at: number } | null {
  if (target >= b.from && target <= b.to + 1) return null;
  const block = lines.slice(b.from, b.to + 1);
  // Remove the block and one blank line that separated it.
  let rmFrom = b.from;
  let rmTo = b.to;
  if (rmTo + 1 < lines.length && isBlank(lines[rmTo + 1])) rmTo++;
  else if (rmFrom > 0 && isBlank(lines[rmFrom - 1])) rmFrom--;
  const removed = rmTo - rmFrom + 1;
  const rest = [...lines.slice(0, rmFrom), ...lines.slice(rmTo + 1)];
  let at = target > rmTo ? target - removed : target;
  at = Math.max(0, Math.min(at, rest.length));
  const before = at > 0 && !isBlank(rest[at - 1]) ? [""] : [];
  const after = at < rest.length && !isBlank(rest[at]) ? [""] : [];
  const out = [...rest.slice(0, at), ...before, ...block, ...after, ...rest.slice(at)];
  return { lines: out, at: at + before.length };
}

/** Insert a copy of block `b` after it, separated by a blank line. */
export function duplicateBlock(lines: string[], b: BlockRange): { lines: string[]; at: number } {
  const block = lines.slice(b.from, b.to + 1);
  const out = [...lines.slice(0, b.to + 1), "", ...block, ...lines.slice(b.to + 1)];
  return { lines: out, at: b.to + 2 };
}

/** Remove block `b` and one blank line that separated it. */
export function deleteBlock(lines: string[], b: BlockRange): string[] {
  let from = b.from;
  let to = b.to;
  if (to + 1 < lines.length && isBlank(lines[to + 1])) to++;
  else if (from > 0 && isBlank(lines[from - 1])) from--;
  return [...lines.slice(0, from), ...lines.slice(to + 1)];
}
