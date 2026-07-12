import { tags as t } from "@lezer/highlight";
import type { MarkdownConfig, InlineContext } from "@lezer/markdown";
import { parseWikilink } from "@/lib/wikilink-syntax";

// ---------------------------------------------------------------------------
// Wikilink parsing for the Markdown editor.
//
// The Markdown grammar has no concept of `[[publisher:type:slug|Label]]` —
// that syntax is handled by remark-wikilinks at publish time. This extension
// teaches the editor's Lezer parser to recognise the same pattern so live
// preview can render chips (and source mode gets sensible highlighting).
// Registered `before: "Link"` so `[[…]]` is not consumed as a shortcut
// reference link — the same precedence technique as lib/codemirror-math.ts.
// ---------------------------------------------------------------------------

const LBRACKET = 91; // "["
const RBRACKET = 93; // "]"
const NEWLINE = 10;

export const MarkdownWikilink: MarkdownConfig = {
  defineNodes: [
    { name: "Wikilink", style: t.link },
    { name: "WikilinkMark", style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: "Wikilink",
      before: "Link",
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== LBRACKET || cx.char(pos + 1) !== LBRACKET) return -1;
        for (let i = pos + 2; i < cx.end - 1; i++) {
          const ch = cx.char(i);
          if (ch === NEWLINE) return -1;
          if (ch === RBRACKET && cx.char(i + 1) === RBRACKET) {
            const full = cx.slice(pos, i + 2);
            // Only the strict publisher:type:slug shape becomes a node —
            // anything else stays literal text (matches remark behavior).
            if (!parseWikilink(full)) return -1;
            return cx.addElement(
              cx.elt("Wikilink", pos, i + 2, [
                cx.elt("WikilinkMark", pos, pos + 2),
                cx.elt("WikilinkMark", i, i + 2),
              ])
            );
          }
        }
        return -1;
      },
    },
  ],
};
