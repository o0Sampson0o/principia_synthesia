import type { Schema } from "hast-util-sanitize";

/**
 * rehype-sanitize schema for MDX article content.
 *
 * Starts from the defaultSchema and extends it to allow:
 * - KaTeX-generated HTML (inline styles, classes on span/div)
 * - GFM tables (table/thead/tbody/tr/th/td with align)
 * - Standard content elements (code, pre, blockquote, etc.)
 *
 * Strips: script, iframe, object, embed, form, input, and unsafe
 * URL schemes (javascript:, data: on href/src).
 *
 * Note: <DynamicAnimation> is a JSX component, not raw HTML — it is
 * processed before sanitization and is unaffected by this schema.
 */
export const mdxSanitizeSchema: Schema = {
  strip: ["script", "iframe", "object", "embed", "form", "input", "textarea", "select", "button"],
  allowComments: false,
  allowDoctypes: false,
  attributes: {
    // KaTeX uses inline styles heavily for math positioning.
    "*": ["className", "style", "id"],
    a: [["href", /^(?!javascript:|data:)/i], "title", "target", "rel"],
    img: [["src", /^(?!javascript:)/i], "alt", "title", "width", "height", "loading"],
    // GFM tables
    th: ["align"],
    td: ["align"],
    // Code blocks with language highlighting
    code: ["className"],
    span: ["className", "style", "aria-hidden"],
    div: ["className", "style", "aria-label"],
    math: ["xmlns", "display"],
    annotation: ["encoding"],
    svg: ["xmlns", "viewBox", "width", "height", "style", "role", "focusable", "x", "y"],
    g: ["transform", "stroke", "fill", "stroke-width", "data-mml-node"],
    path: ["d", "transform", "data-c"],
    use: ["href", "transform"],
  },
  tagNames: [
    // Text
    "p", "br", "strong", "em", "del", "ins", "sub", "sup", "abbr", "cite",
    // Headings
    "h1", "h2", "h3", "h4", "h5", "h6",
    // Lists
    "ul", "ol", "li", "dl", "dt", "dd",
    // Blocks
    "blockquote", "hr", "pre", "code", "details", "summary",
    // Links / media
    "a", "img",
    // GFM tables
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    // KaTeX containers
    "span", "div", "math", "mrow", "mn", "mo", "mi", "msup", "msub",
    "msubsup", "mfrac", "msqrt", "mroot", "munder", "mover",
    "munderover", "mtable", "mtr", "mtd", "mtext", "mspace",
    "annotation", "semantics",
    // SVG (for MathJax SVG output)
    "svg", "g", "path", "rect", "circle", "line", "polyline", "polygon", "ellipse", "use", "defs", "symbol",
    // Sectioning
    "section", "article", "aside", "figure", "figcaption",
  ],
  protocols: {
    href: ["http", "https", "mailto", "#"],
    src: ["http", "https"],
  },
};
