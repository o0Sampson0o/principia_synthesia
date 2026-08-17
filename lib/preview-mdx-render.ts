/**
 * Editor Preview renderer.
 *
 * The published pages compile MDX to React with `next-mdx-remote`. The preview
 * cannot render React to a string (`react-dom/server` is banned in Next's RSC
 * layer), so it renders the SAME source to HTML with a `unified` pipeline that
 * uses `remark-mdx` — so it parses MDX exactly like the published page (HTML/JSX
 * is JSX, not CommonMark HTML blocks, which is what previously caused markdown
 * under an HTML block to be "swallowed").
 *
 * `<Cite>` is mirrored as hast here, since it is pure markup. The components
 * that genuinely need a browser — canvases, Mermaid, embed lookups — get a
 * marked-up mount point instead, which `components/PreviewEmbeds.tsx` fills
 * with the real component once the HTML is in the DOM; imitating them here in
 * hast is how preview and published output drift apart. Every other JSX element
 * with a lowercase name is passed through as the equivalent HTML element.
 * Because this emits an HTML string with no `react-dom/server`, it is safe to
 * call from a Server Action.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { h } from "hastscript";
import type { Root } from "mdast";
import type { State } from "mdast-util-to-hast";
import type { MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";
import { remarkCallouts } from "@/lib/remark-callouts";
import { remarkQuoteAttribution } from "@/lib/remark-quote-attribution";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import { remarkCiteNumbering } from "@/lib/remark-cite-numbering";
import { remarkFencedEmbeds } from "@/lib/remark-fenced-embeds";
import { codeHighlightPlugins } from "@/lib/code-highlight";
import { prepareArticleBody, resolveCitations } from "@/lib/article-mdx";
import { buildKatexMacros, extractMacroSource } from "@/lib/katex-macros";

type JsxNode = MdxJsxFlowElement | MdxJsxTextElement;

/**
 * `remark-mdx` parses a lone JSX element on its own line as *text-level*
 * (`mdxJsxTextElement`), so `remark-rehype` wraps it in a `<p>`. Real `@mdx-js`
 * compilation treats it as flow (no wrapper) — e.g. `<summary>` must be a direct
 * child of `<details>` to work as the disclosure toggle. This promotes a
 * paragraph whose only child is a JSX element back to a flow element, matching
 * the published output.
 */
function remarkUnwrapJsxParagraphs() {
  return (tree: Root) => {
    visit(tree, "paragraph", (node, index, parent) => {
      if (!parent || index === null || index === undefined) return;
      if (node.children.length !== 1) return;
      const child = node.children[0];
      if (child.type !== "mdxJsxTextElement") return;
      (child as unknown as { type: string }).type = "mdxJsxFlowElement";
      parent.children[index] = child as unknown as (typeof parent.children)[number];
    });
  };
}

/** Read a string-valued JSX attribute (the only kind our plugins emit). */
function attr(node: JsxNode, name: string): string | undefined {
  const found = node.attributes.find(
    (a) => a.type === "mdxJsxAttribute" && a.name === name
  );
  return found && typeof found.value === "string" ? found.value : undefined;
}

/** `<Cite>` → the same `[N]` / `[?]` superscript the React component renders. */
function citeToHast(node: JsxNode) {
  const number = attr(node, "number");
  if (number === undefined) return undefined; // unresolved-and-unnumbered → nothing
  const href = attr(node, "resolvedHref");
  const title = attr(node, "resolvedTitle");
  if (!href) {
    return h("sup", { title: "Cited article not found", className: "font-mono text-xs" }, [
      h("span", { className: "sr-only" }, "Cited article not found"),
      h("span", { "aria-hidden": "true" }, "[?]"),
    ]);
  }
  return h("sup", [
    h(
      "a",
      {
        href,
        title,
        className: "themed-link font-mono text-xs",
        "aria-label": `Citation ${number}: ${title ?? ""}`,
      },
      `[${number}]`
    ),
  ]);
}

/**
 * A mount point for a component that can only run in the browser.
 *
 * Canvases, Mermaid and embed lookups all need the client, so the preview HTML
 * carries a marked-up hole and `components/PreviewEmbeds.tsx` mounts the real
 * component into it — the same component the published page renders, rather
 * than a hand-written imitation of it that would drift.
 */
function mountPoint(kind: string, data: Record<string, string | undefined>, className = "") {
  const props: Record<string, string> = { "data-ps-embed": kind };
  if (className) props.className = className;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) props[`data-ps-${key}`] = value;
  }
  return h("div", props);
}

/**
 * remark-rehype handler: turn an MDX JSX element into hast.
 *
 * Bound to the article's publisher, because `<Embed slug="…">` resolves a bare
 * slug against it — the mount point has to carry the answer, since the browser
 * has no idea which publisher the draft belongs to.
 */
function makeJsxHandler(publisherSlug: string) {
  return function jsxHandler(state: State, node: JsxNode) {
    const name = node.name;
    // Fragment `<>…</>` — just its children.
    if (!name) return state.all(node);
    if (name === "Cite") return citeToHast(node);
    if (name === "DynamicAnimation")
      return mountPoint(
        "stored-animation",
        { publisher: attr(node, "publisher"), slug: attr(node, "slug") },
        "my-6"
      );
    if (name === "InlineAnimation")
      return mountPoint(
        "inline-animation",
        { code: attr(node, "code"), height: attr(node, "height") },
        "my-6"
      );
    if (name === "MermaidBlock")
      return mountPoint("mermaid", { source: attr(node, "source") }, "my-8");
    if (name === "Embed")
      // Passed through exactly as authored. Working out what a target means is
      // `resolveEmbed`'s job, and it is reached over the embeds API — parsing
      // it a second time here is how the two would come to disagree.
      return mountPoint("embed", {
        slug: attr(node, "slug"),
        publisher: attr(node, "publisher"),
        "default-publisher": publisherSlug,
      });
    // Any other custom (uppercase) component we don't model → render its children.
    if (/^[A-Z]/.test(name)) return state.all(node);

    // Lowercase name → the equivalent intrinsic HTML element.
    const props: Record<string, string | boolean> = {};
    for (const a of node.attributes) {
      if (a.type !== "mdxJsxAttribute") continue; // skip {...spread}
      if (typeof a.value === "string") props[a.name] = a.value;
      else if (a.value === null || a.value === undefined) props[a.name] = true; // boolean attr, e.g. <details open>
      // expression-valued attributes are dropped (rare in prose)
    }
    return h(name, props, state.all(node));
  };
}

/**
 * Render an article's raw `content` (with frontmatter) to an HTML string,
 * parsing it as MDX so the output matches the published page. Server-safe.
 */
export async function renderPreviewHtml(
  content: string,
  opts: {
    publisherSlug: string;
    /**
     * Macros inherited from the article's book, when it is an internal
     * section. The article's own ```katex block is collected here; a
     * standalone article gets nothing, even if a book links to it.
     */
    bookMacroSource?: string | null;
  }
): Promise<string> {
  const { body, renderedBody } = prepareArticleBody(content, opts);
  const macros = buildKatexMacros(opts.bookMacroSource, extractMacroSource(body));
  const { slugToNumber, resolved } = await resolveCitations(body);
  const jsxHandler = makeJsxHandler(opts.publisherSlug);

  const file = await unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkFencedEmbeds)
    .use(remarkCallouts)
    .use(remarkQuoteAttribution)
    .use(remarkWikilinks)
    .use(remarkCiteNumbering, { slugToNumber, resolved })
    .use(remarkUnwrapJsxParagraphs)
    .use(remarkRehype, {
      handlers: { mdxJsxFlowElement: jsxHandler, mdxJsxTextElement: jsxHandler },
    })
    .use(rehypeSlug)
    .use(rehypeKatex, { macros })
    .use(codeHighlightPlugins)
    .use(rehypeStringify)
    .process(renderedBody);

  return String(file);
}
