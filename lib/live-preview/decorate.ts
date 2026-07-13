import type { EditorState, Range } from "@codemirror/state";
import { Decoration, type DecorationSet, type WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { selectionIntersects, selectionTouchesLine, frontmatterExtent } from "./reveal";
import { BulletWidget, HrWidget } from "./widgets/misc";
import { InlineMathWidget } from "./widgets/math";
import { WikilinkChipWidget } from "./widgets/wikilink";
import { ImageWidget } from "./widgets/image";
import { CiteChipWidget } from "./widgets/cite";
import { AnimationWidget } from "./widgets/animation";
import { buildCitationIndex, type CitationIndex } from "@/lib/mdx-cite-numbering";
import type { Text } from "@codemirror/state";

/**
 * Pure decoration builder for the live-preview ViewPlugin. Given a state and
 * the visible ranges, walks the Lezer syntax tree and produces:
 *
 *  - `decorations`: hide-marks (Decoration.replace), style marks
 *    (Decoration.mark), line classes (Decoration.line), and widgets.
 *  - `atomics`: only the widget-replaced ranges — cursor motion skips over
 *    these as units. Hidden formatting marks are deliberately NOT atomic so
 *    arrows/backspace inside `**bold**` behave like plain text (and entering
 *    the node reveals its syntax).
 *  - `nodeRanges`: extents of every node whose rendering depends on the
 *    selection — the ViewPlugin uses these to skip rebuilds for selection
 *    moves that can't change anything.
 *
 * Constructs live preview leaves untouched (they render as highlighted
 * source): FencedCode, HTML/JSX, tables, autolinks, and the leading YAML
 * frontmatter block.
 */

export interface BuiltDecorations {
  decorations: DecorationSet;
  atomics: DecorationSet;
  nodeRanges: { from: number; to: number }[];
}

// Shared decoration instances (Decoration values are immutable and reusable).
const hide = Decoration.replace({});
const lineDeco: Record<string, Decoration> = {};
for (let level = 1; level <= 6; level++) {
  lineDeco[`h${level}`] = Decoration.line({ class: `cm-lp-h${level}` });
}
lineDeco.blockquote = Decoration.line({ class: "cm-lp-blockquote" });
const strongMark = Decoration.mark({ class: "cm-lp-strong" });
const emMark = Decoration.mark({ class: "cm-lp-em" });
const codeMark = Decoration.mark({ class: "cm-lp-code" });
const linkMark = Decoration.mark({ class: "cm-lp-link" });
const bulletDeco = Decoration.replace({ widget: new BulletWidget() });
const hrDeco = Decoration.replace({ widget: new HrWidget() });

/** Subtrees live preview must leave completely untouched. */
const SKIP_NODES = new Set([
  "FencedCode",
  "CodeBlock",
  "CommentBlock",
  "Table",
  "Autolink",
]);

/** Self-closing <Cite slug="…" /> — one of the two JSX tags live preview
    widget-izes. (Paired <Cite …></Cite> stays as source: two HTMLTag nodes.) */
const CITE_SELF_CLOSING_RE = /^<Cite\b[^>]*\bslug\s*=\s*["']([^"']+)["'][^>]*\/>$/;
/** Self-closing <DynamicAnimation publisher="…" slug="anim-…" />. */
const ANIMATION_RE = /^<DynamicAnimation\b[^>]*\/>$/;
const ATTR_RE = (name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`);

// Citation numbers depend on the whole document (first-appearance order), so
// they're cached per immutable Text instance: recomputed only when the doc
// actually changes, reused across selection/viewport rebuilds.
const citeIndexCache = new WeakMap<Text, CitationIndex>();

function citationIndex(doc: Text): CitationIndex {
  let index = citeIndexCache.get(doc);
  if (!index) {
    index = buildCitationIndex(doc.toString());
    citeIndexCache.set(doc, index);
  }
  return index;
}

/**
 * Maps a single self-closing JSX tag to its live-preview widget, or null when
 * the text isn't a supported tag (so it stays as source). Handles both inline
 * (HTMLTag) and own-line (HTMLBlock) occurrences.
 */
function jsxWidgetFor(text: string, doc: Text): WidgetType | null {
  const cite = CITE_SELF_CLOSING_RE.exec(text);
  if (cite) {
    const slug = cite[1].trim();
    const number = citationIndex(doc).slugToNumber.get(slug) ?? 0;
    return new CiteChipWidget(slug, number);
  }
  if (ANIMATION_RE.test(text)) {
    const publisher = ATTR_RE("publisher").exec(text)?.[1];
    const slug = ATTR_RE("slug").exec(text)?.[1];
    if (publisher && slug) return new AnimationWidget(publisher, slug);
  }
  return null;
}

export function buildInlineDecorations(
  state: EditorState,
  ranges: readonly { from: number; to: number }[]
): BuiltDecorations {
  const decos: Range<Decoration>[] = [];
  const atomics: Range<Decoration>[] = [];
  const nodeRanges: { from: number; to: number }[] = [];
  const sel = state.selection;
  const fmEnd = frontmatterExtent(state.doc);
  const tree = syntaxTree(state);
  // Guards against double-adding when a node spans two visible ranges.
  const seenLines = new Set<string>();
  const seenNodes = new Set<string>();

  const addLine = (pos: number, deco: Decoration, key: string) => {
    const line = state.doc.lineAt(pos);
    const k = `${line.from}:${key}`;
    if (seenLines.has(k)) return;
    seenLines.add(k);
    decos.push(deco.range(line.from));
  };

  for (const { from, to } of ranges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        // Frontmatter and skip-listed subtrees stay source-rendered.
        if (node.from < fmEnd && node.name !== "Document") return false;
        if (SKIP_NODES.has(node.name)) return false;

        const nodeKey = `${node.from}:${node.to}:${node.name}`;

        switch (node.name) {
          case "ATXHeading1":
          case "ATXHeading2":
          case "ATXHeading3":
          case "ATXHeading4":
          case "ATXHeading5":
          case "ATXHeading6": {
            const level = node.name.slice(-1);
            addLine(node.from, lineDeco[`h${level}`], `h${level}`);
            nodeRanges.push({ from: node.from, to: node.to });
            return; // children (HeaderMark) handled below
          }
          case "SetextHeading1":
          case "SetextHeading2": {
            // The underline row can't be hidden from a ViewPlugin (would span
            // a line break); style the text line only.
            const level = node.name.slice(-1);
            addLine(node.from, lineDeco[`h${level}`], `h${level}`);
            return;
          }
          case "HeaderMark": {
            const parent = node.node.parent;
            if (!parent?.name.startsWith("ATXHeading")) return;
            if (selectionTouchesLine(state, parent.from, parent.to)) return;
            if (seenNodes.has(nodeKey)) return;
            seenNodes.add(nodeKey);
            // Hide the marks and the single space that follows leading marks.
            const line = state.doc.lineAt(node.from);
            const afterMark =
              node.to < line.to && state.doc.sliceString(node.to, node.to + 1) === " "
                ? node.to + 1
                : node.to;
            decos.push(hide.range(node.from, afterMark));
            return;
          }

          case "Emphasis":
          case "StrongEmphasis": {
            if (seenNodes.has(nodeKey)) return;
            seenNodes.add(nodeKey);
            decos.push(
              (node.name === "StrongEmphasis" ? strongMark : emMark).range(node.from, node.to)
            );
            nodeRanges.push({ from: node.from, to: node.to });
            return;
          }
          case "EmphasisMark": {
            const parent = node.node.parent;
            if (!parent || (parent.name !== "Emphasis" && parent.name !== "StrongEmphasis")) return;
            if (selectionIntersects(sel, parent.from, parent.to)) return;
            if (seenNodes.has(nodeKey)) return;
            seenNodes.add(nodeKey);
            decos.push(hide.range(node.from, node.to));
            return;
          }

          case "InlineCode": {
            if (seenNodes.has(nodeKey)) return;
            seenNodes.add(nodeKey);
            decos.push(codeMark.range(node.from, node.to));
            nodeRanges.push({ from: node.from, to: node.to });
            return;
          }
          case "CodeMark": {
            const parent = node.node.parent;
            if (parent?.name !== "InlineCode") return; // fenced code marks stay
            if (selectionIntersects(sel, parent.from, parent.to)) return;
            if (seenNodes.has(nodeKey)) return;
            seenNodes.add(nodeKey);
            decos.push(hide.range(node.from, node.to));
            return;
          }

          case "Link": {
            if (seenNodes.has(nodeKey)) return;
            seenNodes.add(nodeKey);
            decos.push(linkMark.range(node.from, node.to));
            nodeRanges.push({ from: node.from, to: node.to });
            return;
          }
          case "LinkMark":
          case "URL": {
            const parent = node.node.parent;
            if (parent?.name !== "Link") return; // leave image syntax alone (v1)
            if (selectionIntersects(sel, parent.from, parent.to)) return;
            if (seenNodes.has(nodeKey)) return;
            seenNodes.add(nodeKey);
            decos.push(hide.range(node.from, node.to));
            return;
          }

          case "Blockquote": {
            for (
              let line = state.doc.lineAt(node.from);
              line.from <= node.to;
              line = state.doc.lineAt(line.to + 1)
            ) {
              addLine(line.from, lineDeco.blockquote, "bq");
              if (line.to >= state.doc.length) break;
            }
            return;
          }
          case "QuoteMark": {
            const line = state.doc.lineAt(node.from);
            nodeRanges.push({ from: line.from, to: line.to });
            if (selectionTouchesLine(state, node.from, node.to)) return;
            if (seenNodes.has(nodeKey)) return;
            seenNodes.add(nodeKey);
            const afterMark =
              state.doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            decos.push(hide.range(node.from, afterMark));
            return;
          }

          case "ListMark": {
            const parent = node.node.parent; // ListItem
            const listType = parent?.parent?.name;
            if (listType !== "BulletList") return; // ordered marks stay visible
            // Task-list checkboxes keep their raw form in v1.
            if (node.node.nextSibling?.name === "Task") return;
            // Reveal is line-based, so the whole line is selection-relevant.
            const markLine = state.doc.lineAt(node.from);
            nodeRanges.push({ from: markLine.from, to: markLine.to });
            if (selectionTouchesLine(state, node.from, node.to)) return;
            if (seenNodes.has(nodeKey)) return;
            seenNodes.add(nodeKey);
            decos.push(bulletDeco.range(node.from, node.to));
            atomics.push(bulletDeco.range(node.from, node.to));
            return;
          }

          case "HorizontalRule": {
            nodeRanges.push({ from: node.from, to: node.to });
            if (selectionTouchesLine(state, node.from, node.to)) return;
            if (seenNodes.has(nodeKey)) return;
            seenNodes.add(nodeKey);
            decos.push(hrDeco.range(node.from, node.to));
            atomics.push(hrDeco.range(node.from, node.to));
            return;
          }

          case "InlineMath": {
            nodeRanges.push({ from: node.from, to: node.to });
            if (selectionIntersects(sel, node.from, node.to)) return false;
            if (seenNodes.has(nodeKey)) return false;
            seenNodes.add(nodeKey);
            // Strip the $ delimiters; the widget renders the formula.
            const formula = state.doc.sliceString(node.from + 1, node.to - 1);
            const deco = Decoration.replace({ widget: new InlineMathWidget(formula) });
            decos.push(deco.range(node.from, node.to));
            atomics.push(deco.range(node.from, node.to));
            return false; // don't descend into the STEX subtree
          }

          case "Wikilink": {
            nodeRanges.push({ from: node.from, to: node.to });
            if (selectionIntersects(sel, node.from, node.to)) return false;
            if (seenNodes.has(nodeKey)) return false;
            seenNodes.add(nodeKey);
            const raw = state.doc.sliceString(node.from, node.to);
            const deco = Decoration.replace({ widget: new WikilinkChipWidget(raw) });
            decos.push(deco.range(node.from, node.to));
            atomics.push(deco.range(node.from, node.to));
            return false;
          }

          case "HTMLTag": // inline: `text <Cite … /> text`
          case "HTMLBlock": {
            // A DynamicAnimation on its own line is an HTMLBlock; an inline
            // Cite is an HTMLTag. Both resolve through the same tag handler.
            const raw = state.doc.sliceString(node.from, node.to);
            const widget = jsxWidgetFor(raw.trim(), state.doc);
            if (!widget) return false; // other JSX/HTML stays as source
            nodeRanges.push({ from: node.from, to: node.to });
            if (selectionIntersects(sel, node.from, node.to)) return false;
            if (seenNodes.has(nodeKey)) return false;
            seenNodes.add(nodeKey);
            const deco = Decoration.replace({ widget });
            decos.push(deco.range(node.from, node.to));
            atomics.push(deco.range(node.from, node.to));
            return false;
          }

          case "Image": {
            nodeRanges.push({ from: node.from, to: node.to });
            if (selectionIntersects(sel, node.from, node.to)) return false;
            if (seenNodes.has(nodeKey)) return false;
            seenNodes.add(nodeKey);
            const text = state.doc.sliceString(node.from, node.to);
            const m = /^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/.exec(text);
            if (!m) return false; // unusual form → leave as source
            const deco = Decoration.replace({ widget: new ImageWidget(m[2], m[1]) });
            decos.push(deco.range(node.from, node.to));
            atomics.push(deco.range(node.from, node.to));
            return false;
          }
        }
      },
    });
  }

  return {
    decorations: Decoration.set(decos, true),
    atomics: Decoration.set(atomics, true),
    nodeRanges,
  };
}
