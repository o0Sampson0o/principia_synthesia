import { parseMixed } from "@lezer/common";
import { StreamLanguage } from "@codemirror/language";
import { stexMath } from "@codemirror/legacy-modes/mode/stex";
import { tags as t } from "@lezer/highlight";
import type {
  MarkdownConfig,
  InlineContext,
  BlockContext,
  Line,
  Element,
} from "@lezer/markdown";

// ---------------------------------------------------------------------------
// LaTeX math highlighting for the Markdown editor.
//
// The Markdown grammar (`@lezer/markdown`) has no concept of `$…$` / `$$…$$`
// math — these come from the remark-math pipeline used to render articles. This
// extension teaches the editor's parser to recognise the same delimiters and
// nests the STEX (TeX/LaTeX) stream parser inside them via `parseMixed`, so the
// math body gets real token-level highlighting instead of plain text.
//
// Delimiters use `tags.processingInstruction`; the inner content is handed off
// to the STEX parser, whose own tokens are styled by the active theme.
// ---------------------------------------------------------------------------

const DOLLAR = 36; // "$"
const BACKSLASH = 92; // "\"
const SPACE = 32;
const TAB = 9;
const NEWLINE = 10;

/** The TeX/LaTeX parser, in math mode, used to highlight math bodies. */
const stexParser = StreamLanguage.define(stexMath).parser;

function isSpace(code: number): boolean {
  return code === SPACE || code === TAB;
}

// Inline math: `$ … $` on a single line. The body must not be padded with
// whitespace next to the delimiters (so prose like "$5 and $10" is not treated
// as math), may contain escaped dollars (`\$`), and may not span a line break.
const InlineMath: MarkdownConfig = {
  defineNodes: [
    { name: "InlineMath" },
    { name: "InlineMathContent", style: t.monospace },
    { name: "InlineMathMark", style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: "InlineMath",
      parse(cx: InlineContext, next: number, pos: number): number {
        // Must open with a single `$` followed by a non-space (block math `$$`
        // and currency-style "$ " are excluded here).
        if (next !== DOLLAR || cx.char(pos + 1) === DOLLAR) return -1;
        const afterOpen = cx.char(pos + 1);
        if (afterOpen === -1 || isSpace(afterOpen)) return -1;

        let end = -1;
        for (let i = pos + 1; i < cx.end; i++) {
          const ch = cx.char(i);
          if (ch === BACKSLASH) {
            i++; // skip the escaped character
            continue;
          }
          if (ch === NEWLINE) break; // inline math stays on one line
          if (ch === DOLLAR) {
            // A closing `$` must hug its content (not "x $"); otherwise keep
            // scanning — this is what lets "$x$ … $y$" pair up correctly.
            if (isSpace(cx.char(i - 1))) continue;
            end = i;
            break;
          }
        }
        if (end === -1) return -1;

        return cx.addElement(
          cx.elt("InlineMath", pos, end + 1, [
            cx.elt("InlineMathMark", pos, pos + 1),
            cx.elt("InlineMathContent", pos + 1, end),
            cx.elt("InlineMathMark", end, end + 1),
          ])
        );
      },
    },
  ],
};

// Block math: a line beginning with `$$`. Supports both the single-line form
// (`$$ … $$`) and the fenced multi-line form that closes on a later `$$`.
const BlockMath: MarkdownConfig = {
  defineNodes: [
    { name: "BlockMath", block: true },
    { name: "BlockMathContent", style: t.monospace },
    { name: "BlockMathMark", style: t.processingInstruction },
  ],
  parseBlock: [
    {
      name: "BlockMath",
      before: "FencedCode",
      parse(cx: BlockContext, line: Line): boolean {
        const openCol = line.pos;
        if (
          line.text.charCodeAt(openCol) !== DOLLAR ||
          line.text.charCodeAt(openCol + 1) !== DOLLAR
        ) {
          return false;
        }

        const blockStart = cx.lineStart + openCol;
        const children: Element[] = [
          cx.elt("BlockMathMark", blockStart, blockStart + 2),
        ];
        const contentFrom = blockStart + 2;

        // Closing `$$` on the same line → single-line block math.
        const sameLineClose = line.text.indexOf("$$", openCol + 2);
        if (sameLineClose !== -1) {
          const closeFrom = cx.lineStart + sameLineClose;
          if (closeFrom > contentFrom) {
            children.push(cx.elt("BlockMathContent", contentFrom, closeFrom));
          }
          children.push(cx.elt("BlockMathMark", closeFrom, closeFrom + 2));
          cx.addElement(cx.elt("BlockMath", blockStart, closeFrom + 2, children));
          cx.nextLine();
          return true;
        }

        // Otherwise gather lines until one containing a closing `$$`.
        let end = cx.lineStart + line.text.length;
        let closed = false;
        while (cx.nextLine()) {
          const closeIdx = line.text.indexOf("$$");
          if (closeIdx !== -1) {
            const closeFrom = cx.lineStart + closeIdx;
            if (closeFrom > contentFrom) {
              children.push(cx.elt("BlockMathContent", contentFrom, closeFrom));
            }
            children.push(cx.elt("BlockMathMark", closeFrom, closeFrom + 2));
            end = closeFrom + 2;
            closed = true;
            cx.nextLine();
            break;
          }
        }
        if (!closed) {
          // Unterminated block: highlight everything consumed so far.
          end = cx.prevLineEnd();
          if (end > contentFrom) {
            children.push(cx.elt("BlockMathContent", contentFrom, end));
          }
        }

        cx.addElement(cx.elt("BlockMath", blockStart, end, children));
        return true;
      },
    },
  ],
};

// Hand math bodies off to the STEX parser for token-level highlighting.
const NestMath: MarkdownConfig = {
  wrap: parseMixed((node) =>
    node.name === "InlineMathContent" || node.name === "BlockMathContent"
      ? { parser: stexParser }
      : null
  ),
};

/** Markdown extension enabling `$…$` / `$$…$$` LaTeX highlighting. */
export const MarkdownMath: MarkdownConfig[] = [InlineMath, BlockMath, NestMath];
