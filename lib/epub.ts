import epub from "epub-gen-memory";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import type { Root, Element, Parent } from "hast";
import { mdxSanitizeSchema } from "./mdx-sanitize";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EpubChapter {
  title: string;
  content?: string | null;
  partTitle?: string | null;
}

export interface BuildEpubOptions {
  title: string;
  author?: string;
  chapters: EpubChapter[];
}

// ─── MathJax SVG renderer ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mjAdaptor: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mjHtml: any = null;

function getMjHtml() {
  if (_mjHtml) return _mjHtml;
  const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js");
  const { mathjax } = require("mathjax-full/js/mathjax.js");
  const { TeX } = require("mathjax-full/js/input/tex.js");
  const { SVG } = require("mathjax-full/js/output/svg.js");
  const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js");
  const { AllPackages } = require("mathjax-full/js/input/tex/AllPackages.js");
  _mjAdaptor = liteAdaptor();
  RegisterHTMLHandler(_mjAdaptor);
  _mjHtml = mathjax.document("", {
    InputJax: new TeX({ packages: AllPackages }),
    OutputJax: new SVG({ fontCache: "none" }),
  });
  return _mjHtml;
}

function latexToSvgString(latex: string, display: boolean): string {
  const html = getMjHtml();
  const node = html.convert(latex, { display });
  const inner = _mjAdaptor.innerHTML(node);
  html.clear();
  return inner;
}

// ─── rehype plugin: replace math code nodes with inline SVG ──────────────────

function rehypeMathSvg() {
  return (tree: Root) => {
    type Replacement = {
      parent: Parent;
      index: number;
      latex: string;
      display: boolean;
    };
    const replacements: Replacement[] = [];

    // Inline math: <code class="... math-inline">latex</code>
    visit(tree, "element", (node: Element, index, parent) => {
      if (index == null || !parent) return;
      const classes = (node.properties?.className as string[] | undefined) ?? [];
      if (node.tagName !== "code" || !classes.includes("math-inline")) return;
      const latex = node.children
        .map((c) => (c.type === "text" ? c.value : ""))
        .join("");
      replacements.push({ parent: parent as Parent, index, latex, display: false });
    });

    // Display math: <pre><code class="... math-display">latex</code></pre>
    // Replace the entire <pre> to get a proper block-level wrapper.
    visit(tree, "element", (node: Element, index, parent) => {
      if (index == null || !parent) return;
      if (node.tagName !== "pre") return;
      const code = node.children.find(
        (c) =>
          c.type === "element" &&
          (c as Element).tagName === "code" &&
          ((c as Element).properties?.className as string[] | undefined)?.includes(
            "math-display"
          )
      ) as Element | undefined;
      if (!code) return;
      const latex = code.children
        .map((c) => (c.type === "text" ? c.value : ""))
        .join("");
      replacements.push({ parent: parent as Parent, index, latex, display: true });
    });

    // Process in reverse index order per parent so earlier indices stay valid.
    replacements.sort((a, b) => (a.parent === b.parent ? b.index - a.index : 0));

    for (const { parent, index, latex, display } of replacements) {
      try {
        const svgStr = latexToSvgString(latex, display);
        const frag = fromHtml(svgStr, { fragment: true, space: "svg" });
        const svgEl = frag.children.find((c) => c.type === "element") as Element | undefined;
        if (!svgEl) continue;

        if (display) {
          parent.children[index] = {
            type: "element",
            tagName: "div",
            properties: { style: "text-align:center;margin:0.75em 0;" },
            children: [svgEl],
          } as Element;
        } else {
          // Wrap in a span to give it a proper inline container in the HAST tree
          parent.children[index] = {
            type: "element",
            tagName: "span",
            properties: { className: ["math-svg-inline"] },
            children: [svgEl],
          } as Element;
        }
      } catch {
        // leave raw latex visible on error
      }
    }
  };
}

// ─── MDX → HTML ───────────────────────────────────────────────────────────────

function cleanMdx(mdx: string): string {
  return mdx
    .replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
      const parts = inner.split("|");
      return parts[parts.length - 1].split(":").pop() ?? inner;
    })
    .replace(/<[A-Z][A-Za-z]*[^>]*\/>/g, "")
    .replace(/<[A-Z][A-Za-z]*[^>]*>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, "");
}

async function mdxToHtml(mdx: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, mdxSanitizeSchema)
    .use(rehypeMathSvg)
    .use(rehypeStringify)
    .process(cleanMdx(mdx));

  return String(file);
}

// ─── Public API ───────────────────────────────────────────────────────────────

const EPUB_CSS = `
.epub-author { color: #555; }
.epub-link { margin-bottom: 30px; }
.epub-link a { color: #666; font-size: 90%; }
.toc-author { font-size: 90%; color: #555; }
.toc-link { color: #999; font-size: 85%; display: block; }
hr { border: 0; border-bottom: 1px solid #dedede; margin: 60px 10%; }
svg { max-width: 100%; }
`;

export async function buildEpub({ title, author, chapters }: BuildEpubOptions): Promise<Buffer> {
  const epubChapters = await Promise.all(
    chapters.map(async (ch) => ({
      title: ch.title,
      content: await mdxToHtml(ch.content ?? ""),
    }))
  );

  const buffer = await epub(
    {
      title,
      author: author ?? "Principia Synthesia",
      css: EPUB_CSS,
    },
    epubChapters
  );

  return buffer as Buffer;
}
