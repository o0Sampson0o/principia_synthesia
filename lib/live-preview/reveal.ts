import type { EditorSelection, EditorState, Text } from "@codemirror/state";

/**
 * Pure reveal-decision helpers for live preview.
 *
 * "Reveal" means: show the raw markdown syntax for a node because the user's
 * selection is inside (or touching) it. Boundaries are inclusive on both ends
 * so arrowing up against `**bold**` reveals it before the cursor enters.
 */

/** True when any selection range intersects [from, to], boundaries inclusive. */
export function selectionIntersects(
  sel: EditorSelection,
  from: number,
  to: number
): boolean {
  return sel.ranges.some((r) => r.from <= to && r.to >= from);
}

/**
 * Line-based reveal (used for headings and quote marks): true when the
 * selection touches any line that [from, to] spans.
 */
export function selectionTouchesLine(
  state: EditorState,
  from: number,
  to: number
): boolean {
  const start = state.doc.lineAt(from);
  const end = to <= start.to ? start : state.doc.lineAt(to);
  return selectionIntersects(state.selection, start.from, end.to);
}

/**
 * End offset of the leading YAML frontmatter block (the closing `---` line's
 * end), or 0 when the document has none / it is unclosed. Mirrors the client
 * parse in FrontmatterPanel: first line exactly `---`, closed by a later
 * `---` line. Everything before this offset gets no live-preview decorations
 * (so the delimiters are never rendered as horizontal rules).
 */
export function frontmatterExtent(doc: Text): number {
  if (doc.lines < 2) return 0;
  if (doc.line(1).text.trim() !== "---") return 0;
  for (let i = 2; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (line.text.trim() === "---") return line.to;
  }
  return 0;
}
