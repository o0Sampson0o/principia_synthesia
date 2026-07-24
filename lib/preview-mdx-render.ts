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
 * The two custom components (`<Cite>`, `<DynamicAnimation>`) are mirrored as
 * hast here so their visual output matches; every other JSX element with a
 * lowercase name is passed through as the equivalent HTML element. Because this
 * emits an HTML string with no `react-dom/server`, it is safe to call from a
 * Server Action.
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
import { prepareArticleBody, resolveCitations } from "@/lib/article-mdx";

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

/** `<DynamicAnimation>` → the "View animation" placeholder (canvas is client-only). */
function animationToHast(node: JsxNode) {
  const publisher = attr(node, "publisher") ?? "";
  const slug = attr(node, "slug") ?? "";
  return h("div", { className: "my-6" }, [
    h("div", { className: "mt-2 text-right" }, [
      h(
        "a",
        {
          href: `/${publisher}/objects/${slug}`,
          className: "text-xs themed-muted themed-hover-foreground transition-colors",
        },
        "View animation →"
      ),
    ]),
  ]);
}

/** remark-rehype handler: turn an MDX JSX element into hast. */
function jsxHandler(state: State, node: JsxNode) {
  const name = node.name;
  // Fragment `<>…</>` — just its children.
  if (!name) return state.all(node);
  if (name === "Cite") return citeToHast(node);
  if (name === "DynamicAnimation") return animationToHast(node);
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
}

/**
 * Render an article's raw `content` (with frontmatter) to an HTML string,
 * parsing it as MDX so the output matches the published page. Server-safe.
 */
export async function renderPreviewHtml(
  content: string,
  opts: { publisherSlug: string }
): Promise<string> {
  const { body, renderedBody } = prepareArticleBody(content, opts);
  const { slugToNumber, resolved } = await resolveCitations(body);

  const file = await unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkCallouts)
    .use(remarkQuoteAttribution)
    .use(remarkWikilinks)
    .use(remarkCiteNumbering, { slugToNumber, resolved })
    .use(remarkUnwrapJsxParagraphs)
    .use(remarkRehype, {
      handlers: { mdxJsxFlowElement: jsxHandler, mdxJsxTextElement: jsxHandler },
    })
    .use(rehypeSlug)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(renderedBody);

  return String(file);
}
