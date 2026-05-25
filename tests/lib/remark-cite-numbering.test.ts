import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { remarkCiteNumbering, type ResolvedCitation } from "@/lib/remark-cite-numbering";
import type { Root } from "mdast";
import type { MdxJsxFlowElement, MdxJsxAttribute } from "mdast-util-mdx-jsx";

/**
 * Parse MDX source through remarkParse + remarkMdx + remarkCiteNumbering and
 * return the transformed AST root.
 */
function process(
  mdx: string,
  slugToNumber: Map<string, number>,
  resolved: Map<string, ResolvedCitation>
): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkCiteNumbering, { slugToNumber, resolved });
  const tree = processor.parse(mdx) as Root;
  processor.runSync(tree);
  return tree;
}

/** Find all mdxJsxFlowElement nodes named "Cite" in the tree. */
function findCiteNodes(tree: Root): MdxJsxFlowElement[] {
  const results: MdxJsxFlowElement[] = [];
  function walk(node: { type: string; children?: unknown[]; name?: string }) {
    if (node.type === "mdxJsxFlowElement" && node.name === "Cite") {
      results.push(node as unknown as MdxJsxFlowElement);
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child as typeof node);
      }
    }
  }
  walk(tree as unknown as { type: string; children: unknown[] });
  return results;
}

function getAttr(node: MdxJsxFlowElement, name: string): string | undefined {
  const attr = node.attributes.find(
    (a): a is MdxJsxAttribute => "name" in a && a.name === name
  );
  return typeof attr?.value === "string" ? attr.value : undefined;
}

describe("remarkCiteNumbering", () => {
  it("injects number attribute for a known slug", () => {
    const slugToNumber = new Map([["alice/article-intro", 1]]);
    const resolved = new Map<string, ResolvedCitation>();

    const tree = process(`<Cite slug="alice/article-intro" />`, slugToNumber, resolved);
    const cites = findCiteNodes(tree);
    expect(cites).toHaveLength(1);
    expect(getAttr(cites[0], "number")).toBe("1");
  });

  it("injects resolvedTitle and resolvedHref when citation is resolved", () => {
    const slugToNumber = new Map([["alice/article-intro", 1]]);
    const resolved = new Map<string, ResolvedCitation>([
      ["alice/article-intro", { title: "Introduction to Topology", href: "/alice/articles/article-intro" }],
    ]);

    const tree = process(`<Cite slug="alice/article-intro" />`, slugToNumber, resolved);
    const cites = findCiteNodes(tree);
    expect(getAttr(cites[0], "resolvedTitle")).toBe("Introduction to Topology");
    expect(getAttr(cites[0], "resolvedHref")).toBe("/alice/articles/article-intro");
  });

  it("does not inject resolvedTitle/resolvedHref when citation is unresolved", () => {
    const slugToNumber = new Map([["alice/article-missing", 1]]);
    const resolved = new Map<string, ResolvedCitation>(); // empty — not resolved

    const tree = process(`<Cite slug="alice/article-missing" />`, slugToNumber, resolved);
    const cites = findCiteNodes(tree);
    expect(getAttr(cites[0], "number")).toBe("1");
    expect(getAttr(cites[0], "resolvedTitle")).toBeUndefined();
    expect(getAttr(cites[0], "resolvedHref")).toBeUndefined();
  });

  it("assigns correct numbers to multiple citations in order", () => {
    const slugToNumber = new Map([
      ["alice/article-first", 1],
      ["bob/article-second", 2],
    ]);
    const resolved = new Map<string, ResolvedCitation>();

    const tree = process(
      `<Cite slug="alice/article-first" />\n\n<Cite slug="bob/article-second" />`,
      slugToNumber,
      resolved
    );
    const cites = findCiteNodes(tree);
    expect(cites).toHaveLength(2);
    expect(getAttr(cites[0], "number")).toBe("1");
    expect(getAttr(cites[1], "number")).toBe("2");
  });

  it("does not inject number for a slug not in slugToNumber", () => {
    const slugToNumber = new Map<string, number>(); // empty
    const resolved = new Map<string, ResolvedCitation>();

    const tree = process(`<Cite slug="unknown/article-x" />`, slugToNumber, resolved);
    const cites = findCiteNodes(tree);
    expect(cites).toHaveLength(1);
    expect(getAttr(cites[0], "number")).toBeUndefined();
  });

  it("leaves non-Cite JSX elements unchanged", () => {
    const slugToNumber = new Map([["alice/article-intro", 1]]);
    const resolved = new Map<string, ResolvedCitation>();

    // DynamicAnimation should not be modified
    const tree = process(
      `<DynamicAnimation slug="anim-foo" />\n\n<Cite slug="alice/article-intro" />`,
      slugToNumber,
      resolved
    );
    const cites = findCiteNodes(tree);
    expect(cites).toHaveLength(1);
    expect(getAttr(cites[0], "number")).toBe("1");
  });
});
