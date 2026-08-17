/**
 * Let authors write `style="color: red"` on inline HTML in prose.
 *
 * Prose authors reach for HTML attribute syntax, and the editor Preview
 * encourages it: that pipeline turns a lowercase JSX element into the
 * equivalent hast element (`lib/preview-mdx-render.ts`), where a string `style`
 * is exactly what an HTML attribute should be, so it renders correctly.
 *
 * The published page compiles the same source to React, where `style` must be
 * an object — a string makes React *throw* at render time (error #62), not
 * warn. So the document compiles clean, "Check MDX" reports OK, the Preview
 * looks right, and only the real page breaks. This rewrites the string into the
 * object literal React wants.
 *
 * ## Why this is a rehype plugin
 *
 * It has to run after remark, not during it. `next-mdx-remote`'s `serialize`
 * appends its own `removeJavaScriptExpressions` plugin to the end of the remark
 * list — a security control that strips every `mdxJsxAttributeValueExpression`
 * so user-authored MDX cannot smuggle in executable JS. A remark plugin here,
 * however early or late in our own list, is still upstream of it, and the
 * object literal gets deleted again before it reaches the compiler.
 *
 * Running in the rehype phase sidesteps that without weakening it: expressions
 * the *author* wrote are still stripped by the remark pass, and the only one
 * that survives is the one synthesised below out of string literals parsed from
 * a CSS declaration list. Nothing author-supplied is ever evaluated. (The other
 * route out — passing `blockJS: false` — would disable the control wholesale
 * and is not an option on a multi-tenant publishing platform.)
 *
 * It runs on the published pipeline only. The Preview already renders string
 * styles correctly and its JSX handler drops expression-valued attributes, so
 * applying this there would delete the styling it currently gets right.
 */
import { visit } from "unist-util-visit";
import type { Node } from "unist";
import type { MdxJsxAttribute } from "mdast-util-mdx-jsx";

/**
 * The MDX JSX node shape, which is identical in mdast and hast — only the
 * `attributes` array matters here.
 */
interface JsxElementNode extends Node {
  attributes: Array<MdxJsxAttribute | { type: string }>;
}

/** `background-color` → `backgroundColor`; `--custom-prop` is left alone. */
function toCamelCase(property: string): string {
  if (property.startsWith("--")) return property;
  return property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Parse a CSS declaration list into React style-object entries.
 *
 * Splits only on top-level `;` and `:` so values that legitimately contain them
 * — `url(data:image/png;base64,…)`, `grid-template-areas`, quoted content —
 * survive intact.
 */
export function parseStyleString(css: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  const declarations: string[] = [];

  for (const char of css) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth++;
    } else if (char === ")") {
      if (depth > 0) depth--;
    } else if (char === ";" && depth === 0) {
      declarations.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  declarations.push(current);

  for (const declaration of declarations) {
    const trimmed = declaration.trim();
    if (trimmed === "") continue;
    // Split on the first top-level colon; `url(data:…)` must not split here.
    let colon = -1;
    let d = 0;
    let q: string | null = null;
    for (let i = 0; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (q) {
        if (c === q) q = null;
      } else if (c === '"' || c === "'") q = c;
      else if (c === "(") d++;
      else if (c === ")") { if (d > 0) d--; }
      else if (c === ":" && d === 0) { colon = i; break; }
    }
    if (colon === -1) continue; // no value — not a declaration
    const property = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (property === "" || value === "") continue;
    entries.push([toCamelCase(property), value]);
  }

  return entries;
}

/**
 * Build the `mdxJsxAttributeValueExpression` for a style object.
 *
 * The estree is constructed directly rather than parsed from text: every key
 * and value here is a plain string literal, so there is nothing to parse, and
 * this avoids depending on acorn (only a transitive dependency).
 */
function styleObjectAttributeValue(entries: Array<[string, string]>) {
  const source = `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")}}`;
  return {
    type: "mdxJsxAttributeValueExpression" as const,
    value: source,
    data: {
      estree: {
        type: "Program" as const,
        sourceType: "module" as const,
        comments: [],
        body: [
          {
            type: "ExpressionStatement" as const,
            expression: {
              type: "ObjectExpression" as const,
              properties: entries.map(([key, value]) => ({
                type: "Property" as const,
                method: false,
                shorthand: false,
                computed: false,
                kind: "init" as const,
                key: { type: "Literal" as const, value: key },
                value: { type: "Literal" as const, value },
              })),
            },
          },
        ],
      },
    },
  };
}

export function rehypeJsxStyleObjects() {
  return (tree: Node) => {
    const rewrite = (node: JsxElementNode) => {
      // Rebuilt rather than mutated in place: an unusable `style` has to be
      // removed outright. Leaving it valueless compiles to `style={true}`,
      // which React rejects exactly like the string did.
      node.attributes = node.attributes.filter((raw) => {
        if (raw.type !== "mdxJsxAttribute") return true; // {...spread}
        const attribute = raw as MdxJsxAttribute;
        if (attribute.name !== "style") return true;
        if (typeof attribute.value !== "string") return true; // already an expression
        const entries = parseStyleString(attribute.value);
        if (entries.length === 0) return false; // e.g. `style=""`
        (attribute as unknown as { value: unknown }).value = styleObjectAttributeValue(entries);
        return true;
      });
    };
    visit(tree, "mdxJsxFlowElement", rewrite as (n: Node) => void);
    visit(tree, "mdxJsxTextElement", rewrite as (n: Node) => void);
  };
}
