import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";

export interface ResolvedCitation {
  title: string;
  href: string;
}

export interface RemarkCiteNumberingOptions {
  /** Maps each slug to its 1-based display number. */
  slugToNumber: Map<string, number>;
  /** Maps each slug to its resolved article title and href. Missing = unresolved. */
  resolved: Map<string, ResolvedCitation>;
}

/**
 * Remark plugin that rewrites `<Cite slug="publisher/article-slug" />` JSX
 * elements to inject `number`, `resolvedTitle`, and `resolvedHref` props.
 *
 * This makes <Cite> a pure presentational component that receives all data it
 * needs as props — avoids React Context across RSC boundaries.
 *
 * Usage:
 * ```ts
 * remarkPlugins: [
 *   [remarkCiteNumbering, { slugToNumber, resolved }]
 * ]
 * ```
 */
export function remarkCiteNumbering(options: RemarkCiteNumberingOptions) {
  const { slugToNumber, resolved } = options;

  return (tree: Root) => {
    // Visit both flow-level (<Cite />) and text-level inline uses
    visit(
      tree,
      (node) =>
        node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement",
      (node) => {
        const jsxNode = node as MdxJsxFlowElement | MdxJsxTextElement;
        if (jsxNode.name !== "Cite") return;

        // Find the slug attribute
        const slugAttr = jsxNode.attributes.find(
          (attr): attr is MdxJsxAttribute =>
            "name" in attr && attr.name === "slug"
        );
        if (!slugAttr || typeof slugAttr.value !== "string") return;

        const slug = slugAttr.value;
        const number = slugToNumber.get(slug);
        const resolvedEntry = resolved.get(slug);

        // Inject number prop
        if (number !== undefined) {
          const existingNumber = jsxNode.attributes.findIndex(
            (a): a is MdxJsxAttribute => "name" in a && a.name === "number"
          );
          const numberAttr: MdxJsxAttribute = {
            type: "mdxJsxAttribute",
            name: "number",
            value: String(number),
          };
          if (existingNumber !== -1) {
            jsxNode.attributes[existingNumber] = numberAttr;
          } else {
            jsxNode.attributes.push(numberAttr);
          }
        }

        // Inject resolvedTitle and resolvedHref props
        if (resolvedEntry) {
          jsxNode.attributes.push({
            type: "mdxJsxAttribute",
            name: "resolvedTitle",
            value: resolvedEntry.title,
          });
          jsxNode.attributes.push({
            type: "mdxJsxAttribute",
            name: "resolvedHref",
            value: resolvedEntry.href,
          });
        }
      }
    );
  };
}
