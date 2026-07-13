import { keymap, type EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * Notion-style "Turn into": convert the current line(s) from one block type to
 * another by rewriting the line's markdown prefix. Pure helpers below are
 * unit-tested; the keymap wires the common conversions.
 *
 * The document stays plain markdown — this only edits the leading marker.
 */

/** Leading block markers we recognise, in match order (most specific first). */
const PREFIX_RE = /^(\s*)(#{1,6}\s+|>\s*\[![\w]+\][+-]?\s*|>\s*|-\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+)?/;

/** Splits a line into indent, existing block prefix, and bare content. */
export function splitBlockPrefix(line: string): {
  indent: string;
  prefix: string;
  content: string;
} {
  const m = PREFIX_RE.exec(line);
  const indent = m?.[1] ?? "";
  const prefix = m?.[2] ?? "";
  const content = line.slice((indent + prefix).length);
  return { indent, prefix, content };
}

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote";

const MARKER: Record<BlockType, string> = {
  paragraph: "",
  h1: "# ",
  h2: "## ",
  h3: "### ",
  bullet: "- ",
  numbered: "1. ",
  todo: "- [ ] ",
  quote: "> ",
};

/** Rewrites a single line to the target block type, preserving indentation. */
export function convertLine(line: string, target: BlockType): string {
  const { indent, content } = splitBlockPrefix(line);
  return indent + MARKER[target] + content;
}

/** CodeMirror command: convert every line touched by the selection. */
function turnInto(target: BlockType) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const changes: { from: number; to: number; insert: string }[] = [];
    const seen = new Set<number>();
    for (const range of state.selection.ranges) {
      let pos = range.from;
      while (pos <= range.to) {
        const line = state.doc.lineAt(pos);
        if (!seen.has(line.number)) {
          seen.add(line.number);
          const next = convertLine(line.text, target);
          if (next !== line.text) {
            changes.push({ from: line.from, to: line.to, insert: next });
          }
        }
        if (line.to >= state.doc.length) break;
        pos = line.to + 1;
      }
    }
    if (changes.length === 0) return false;
    view.dispatch({ changes });
    return true;
  };
}

export const turnIntoKeymap: Extension = keymap.of([
  { key: "Mod-Alt-0", run: turnInto("paragraph") },
  { key: "Mod-Alt-1", run: turnInto("h1") },
  { key: "Mod-Alt-2", run: turnInto("h2") },
  { key: "Mod-Alt-3", run: turnInto("h3") },
  { key: "Mod-Alt-7", run: turnInto("bullet") },
  { key: "Mod-Alt-8", run: turnInto("numbered") },
  { key: "Mod-Alt-9", run: turnInto("todo") },
  { key: "Mod-Alt-q", run: turnInto("quote") },
]);
