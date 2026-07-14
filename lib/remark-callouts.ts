import { visit } from "unist-util-visit";
import type { Root, Blockquote, Paragraph, Text, PhrasingContent } from "mdast";

/**
 * Remark plugin: GitHub/Obsidian-style callouts.
 *
 *   > [!note] Optional title
 *   > Body text.
 *
 * A blockquote whose first line is `[!type]` (optionally `+`/`-` for
 * foldable, optionally followed by a title) becomes a styled callout box.
 * Blockquotes without the marker are left as ordinary quotes, so the syntax
 * degrades to a plain blockquote in any other renderer.
 *
 * The type set matches Obsidian's; unknown types fall back to "note".
 */

const KNOWN_TYPES = new Set([
  "note", "abstract", "summary", "tldr", "info", "todo", "tip", "hint", "important",
  "success", "check", "done", "question", "help", "faq", "warning", "caution",
  "attention", "failure", "fail", "missing", "danger", "error", "bug", "example", "quote", "cite",
]);

const MARKER_RE = /^\[!(\w+)\]([+-]?)\s*(.*)$/;

function canonicalType(raw: string): string {
  const t = raw.toLowerCase();
  return KNOWN_TYPES.has(t) ? t : "note";
}

export function remarkCallouts() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const first = node.children[0];
      if (!first || first.type !== "paragraph") return;
      const para = first as Paragraph;
      const firstChild = para.children[0];
      if (!firstChild || firstChild.type !== "text") return;

      const text = firstChild as Text;
      const nl = text.value.indexOf("\n");
      const firstLine = nl === -1 ? text.value : text.value.slice(0, nl);
      const rest = nl === -1 ? "" : text.value.slice(nl + 1);

      const m = MARKER_RE.exec(firstLine.trim());
      if (!m) return;

      const type = canonicalType(m[1]);
      const foldable = m[2] === "+" || m[2] === "-";
      const defaultOpen = m[2] !== "-";
      const title = m[3].trim() || m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();

      // Strip the marker line from the first text node (keep any body on the
      // same node that followed a soft break).
      if (rest) {
        text.value = rest;
      } else {
        para.children.shift();
        // If the paragraph is now empty, drop it entirely.
        if (para.children.length === 0) node.children.shift();
      }

      // Title element. A foldable callout becomes a native <details>, so its
      // title is the <summary> that toggles it (no JavaScript); a static
      // callout keeps a plain paragraph title.
      const titleNode: Paragraph = {
        type: "paragraph",
        children: [{ type: "text", value: title } as Text] as PhrasingContent[],
        data: {
          hName: foldable ? "summary" : undefined,
          hProperties: { className: ["callout-title"] },
        },
      };
      node.children.unshift(titleNode);

      // Foldable → <details> (collapses natively; `open` set from the +/-
      // marker); static → <div>.
      node.data = {
        ...node.data,
        hName: foldable ? "details" : "div",
        hProperties: {
          className: ["callout", `callout-${type}`],
          "data-callout": type,
          ...(foldable && defaultOpen ? { open: true } : {}),
        },
      };
    });
  };
}
