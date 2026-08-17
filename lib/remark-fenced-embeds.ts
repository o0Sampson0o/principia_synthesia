import { visit, SKIP } from "unist-util-visit";
import type { Root, Code } from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import { MACRO_FENCE_LANG } from "@/lib/katex-macros";

/**
 * Remark plugin that turns two fenced code languages into live embeds instead
 * of code listings:
 *
 * - ```mermaid  → `<MermaidBlock source="…" />`
 * - ```animation → `<InlineAnimation code="…" height="…" />`
 * - ```katex     → nothing (a KaTeX macro block; see `lib/katex-macros.ts`)
 *
 * Both are *rendering* languages, not languages you read as source: an author
 * writing them wants the diagram or the canvas, the way every other Markdown
 * tool renders a ```mermaid block. Everything else is left as a `code` node for
 * the syntax highlighter downstream (`lib/code-highlight.ts`), which is also
 * why this plugin has to run before it.
 *
 * The replacement is an MDX JSX element rather than raw HTML so both renderers
 * can pick it up: the published pages map the component name through
 * `buildArticleComponents`, and the editor Preview maps it in its `jsxHandler`.
 *
 * The `animation` fence takes its frame height from the fence meta:
 *
 *     ```animation height=520
 */
export function remarkFencedEmbeds() {
  return (tree: Root) => {
    visit(tree, "code", (node: Code, index, parent) => {
      if (!parent || index === undefined || index === null) return;
      const lang = node.lang?.toLowerCase();

      // Macro definitions are configuration, not content: their effect is
      // already collected into the `macros` option before parsing, so the
      // block itself must leave no trace.
      if (lang === MACRO_FENCE_LANG) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }

      if (lang === "mermaid") {
        parent.children[index] = jsxElement("MermaidBlock", { source: node.value });
        return;
      }

      if (lang === "animation") {
        const height = readMetaNumber(node.meta, "height");
        parent.children[index] = jsxElement("InlineAnimation", {
          code: node.value,
          ...(height !== null ? { height: String(height) } : {}),
        });
      }
    });
  };
}

/**
 * The same two fences, for renderers that have no browser: EPUB and PDF export.
 *
 * Those pipelines already drop every `<Component />` from the prose, because a
 * canvas cannot be printed. An `animation` fence is the same thing written
 * differently, so it gets the same treatment plus a line saying what is missing
 * — otherwise a book would carry a page of raw JavaScript where a figure was
 * meant to be.
 *
 * A `mermaid` fence keeps its source. It is a written description of a diagram
 * and reads as one; dropping it would lose the content outright.
 */
export function remarkFencedEmbedsStatic() {
  return (tree: Root) => {
    visit(tree, "code", (node: Code, index, parent) => {
      if (!parent || index === undefined || index === null) return;
      // Same as the live pipeline: a macro block is configuration and must not
      // print. Exports do not expand the macros (they render math with their
      // own engines), but showing the raw definitions would be worse.
      if (node.lang?.toLowerCase() === MACRO_FENCE_LANG) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      if (node.lang?.toLowerCase() !== "animation") return;
      parent.children[index] = {
        type: "paragraph",
        children: [{ type: "emphasis", children: [{ type: "text", value: "Animation — view online." }] }],
      };
    });
  };
}

/** Builds an MDX JSX flow element with string-valued attributes. */
function jsxElement(name: string, attributes: Record<string, string>): MdxJsxFlowElement {
  return {
    type: "mdxJsxFlowElement",
    name,
    attributes: Object.entries(attributes).map(([attrName, value]) => ({
      type: "mdxJsxAttribute",
      name: attrName,
      value,
    })),
    children: [],
  };
}

/** Reads `key=123` out of a fence's meta string. Null when absent or unparseable. */
function readMetaNumber(meta: string | null | undefined, key: string): number | null {
  if (!meta) return null;
  const match = new RegExp(`\\b${key}\\s*=\\s*"?(\\d+)"?`).exec(meta);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
