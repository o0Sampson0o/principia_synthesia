import { visit } from "unist-util-visit";
import type { Root, Blockquote, Paragraph, Text, PhrasingContent } from "mdast";

/**
 * Remark plugin: blockquote attributions.
 *
 *   > The quote itself.
 *   > --- Author, *Work*
 *
 * When the last line of a blockquote starts with `---` (two or more hyphens,
 * or an em dash), that line is lifted out of the quote body and rendered as a
 * right-aligned <footer class="quote-attribution"> prefixed with an em-dash
 * rule ("——— "). Inline formatting in the attribution is preserved. The line
 * may sit in its own `>` paragraph or continue the quote paragraph (including
 * the lazy form where the `>` prefix is omitted). Blockquotes already claimed
 * by remarkCallouts are skipped — run this plugin after it.
 */

const MARKER_RE = /^[ \t]*(?:-{2,}|—)[ \t]*/;

export function remarkQuoteAttribution() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      // Already transformed into a callout <div>/<details>.
      if (node.data?.hName) return;

      const para = node.children[node.children.length - 1];
      if (!para || para.type !== "paragraph") return;

      // Locate the start of the paragraph's last line: after the final hard
      // break node, or after the final "\n" inside a text node — whichever
      // comes last. splitOffset === -1 marks a break-node boundary.
      let splitNode = -1;
      let splitOffset = 0;
      for (let i = para.children.length - 1; i >= 0; i--) {
        const c = para.children[i];
        if (c.type === "break") {
          splitNode = i + 1;
          splitOffset = -1;
          break;
        }
        if (c.type === "text" && c.value.includes("\n")) {
          splitNode = i;
          splitOffset = c.value.lastIndexOf("\n") + 1;
          break;
        }
      }

      // The line must begin inside a text node whose remainder carries the
      // marker; formatting is allowed only after the marker.
      let lineText: string;
      if (splitNode === -1) {
        // Single-line paragraph: only counts when it's a standalone
        // attribution paragraph below the actual quote.
        if (node.children.length < 2) return;
        splitNode = 0;
        const first = para.children[0];
        if (!first || first.type !== "text") return;
        lineText = first.value;
      } else {
        const at = para.children[splitNode];
        if (!at || at.type !== "text") return;
        lineText = splitOffset > 0 ? at.value.slice(splitOffset) : at.value;
      }

      const m = MARKER_RE.exec(lineText);
      if (!m) return;

      const remainder = lineText.slice(m[0].length);
      const trailing = para.children.slice(splitNode + 1);
      if (!remainder.trim() && trailing.length === 0) return;

      const attribution: PhrasingContent[] = [
        { type: "text", value: `——— ${remainder}` } as Text,
        ...trailing,
      ];

      // Strip the attribution line from the quote body.
      if (splitOffset > 0) {
        const at = para.children[splitNode] as Text;
        at.value = at.value.slice(0, splitOffset - 1).replace(/[ \t]+$/, "");
        para.children = para.children.slice(0, at.value ? splitNode + 1 : splitNode);
      } else {
        // Line started at a node boundary; also drop a preceding hard break.
        const keep = splitOffset === -1 ? splitNode - 1 : splitNode;
        para.children = para.children.slice(0, keep);
      }
      if (para.children.length === 0) node.children.pop();

      const footer: Paragraph = {
        type: "paragraph",
        children: attribution,
        data: { hName: "footer", hProperties: { className: ["quote-attribution"] } },
      };
      node.children.push(footer);
    });
  };
}
