import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";
import type {
  ContainerDirective,
  LeafDirective,
  TextDirective,
} from "mdast-util-directive";

/**
 * Column layouts via remark-directive container directives:
 *
 *   ::::columns
 *   :::column
 *   Left content.
 *   :::
 *   :::column{width=30}
 *   Right content.
 *   :::
 *   ::::
 *
 * `columns` → a flex row; each `column` → a flex child (optional `width=N`
 * sets flex-basis). The `::::`/`:::` nesting is how remark-directive
 * disambiguates outer from inner containers.
 *
 * CRUCIAL: remark-directive also parses inline `:name` and leaf `::name`
 * directives, which would eat ordinary prose like "12:30" or "3::4". This
 * plugin reverts every directive it does NOT handle back to literal text, so
 * remark-directive is safe to run over arbitrary article content.
 */

type AnyDirective = ContainerDirective | LeafDirective | TextDirective;

/** Best-effort literal source for an unhandled directive (so prose survives). */
function directiveToText(node: AnyDirective): string {
  const marker =
    node.type === "containerDirective" ? ":::" : node.type === "leafDirective" ? "::" : ":";
  return marker + node.name;
}

export function remarkColumns() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      const type = node.type;
      if (
        type !== "containerDirective" &&
        type !== "leafDirective" &&
        type !== "textDirective"
      ) {
        return;
      }
      const directive = node as AnyDirective;

      if (type === "containerDirective" && directive.name === "columns") {
        const data = directive.data || (directive.data = {});
        data.hName = "div";
        data.hProperties = { className: ["columns"] };
        return;
      }
      if (type === "containerDirective" && directive.name === "column") {
        const data = directive.data || (directive.data = {});
        data.hName = "div";
        const width = directive.attributes?.width;
        data.hProperties =
          width && /^\d+$/.test(width)
            ? { className: ["column"], style: `flex: 0 0 ${width}%` }
            : { className: ["column"] };
        return;
      }

      // Any other directive (including accidental prose like ":30") reverts to
      // literal text so nothing is silently dropped or corrupted.
      if (parent && typeof index === "number") {
        const replacement: Text = { type: "text", value: directiveToText(directive) };
        parent.children.splice(index, 1, replacement);
        return index; // re-visit the replacement position
      }
    });
  };
}
