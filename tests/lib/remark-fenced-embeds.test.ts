// @vitest-environment node
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root } from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import { remarkFencedEmbeds, remarkFencedEmbedsStatic } from "@/lib/remark-fenced-embeds";

/** Parses `source` and runs the plugin, returning the transformed tree. */
function transform(source: string): Root {
  const processor = unified().use(remarkParse).use(remarkFencedEmbeds);
  return processor.runSync(processor.parse(source)) as Root;
}

/** The single top-level node, asserted to be a JSX element. */
function onlyJsx(source: string): MdxJsxFlowElement {
  const node = transform(source).children[0];
  expect(node.type).toBe("mdxJsxFlowElement");
  return node as unknown as MdxJsxFlowElement;
}

function attr(node: MdxJsxFlowElement, name: string) {
  const found = node.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  return found && typeof found.value === "string" ? found.value : undefined;
}

describe("remarkFencedEmbeds", () => {
  it("turns a ```mermaid fence into <MermaidBlock> carrying the source", () => {
    const node = onlyJsx("```mermaid\ngraph TD;\n  A-->B;\n```");
    expect(node.name).toBe("MermaidBlock");
    expect(attr(node, "source")).toBe("graph TD;\n  A-->B;");
  });

  it("turns a ```animation fence into <InlineAnimation> carrying the code", () => {
    const node = onlyJsx("```animation\nfunction Wave() {}\n```");
    expect(node.name).toBe("InlineAnimation");
    expect(attr(node, "code")).toBe("function Wave() {}");
    // No meta → no height, so the frame falls back to the shared default.
    expect(attr(node, "height")).toBeUndefined();
  });

  it("reads the frame height from the fence meta", () => {
    expect(attr(onlyJsx("```animation height=520\nx\n```"), "height")).toBe("520");
    expect(attr(onlyJsx('```animation height="520"\nx\n```'), "height")).toBe("520");
    expect(attr(onlyJsx("```animation height=abc\nx\n```"), "height")).toBeUndefined();
  });

  it("is case-insensitive about the language", () => {
    expect(onlyJsx("```Mermaid\ngraph TD;\n```").name).toBe("MermaidBlock");
  });

  it("leaves every other fence as a code node for the highlighter", () => {
    for (const lang of ["cpp", "js", "", "text"]) {
      const node = transform("```" + lang + "\nint x = 0;\n```").children[0];
      expect(node.type).toBe("code");
    }
  });

  it("leaves indented and inline code alone", () => {
    const tree = transform("    mermaid\n\nSome `mermaid` text.");
    expect(tree.children[0].type).toBe("code");
    expect(tree.children[1].type).toBe("paragraph");
  });
});

describe("remarkFencedEmbedsStatic (EPUB / PDF export)", () => {
  function transformStatic(source: string): Root {
    const processor = unified().use(remarkParse).use(remarkFencedEmbedsStatic);
    return processor.runSync(processor.parse(source)) as Root;
  }

  it("replaces an animation fence with a note instead of printing its code", () => {
    const tree = transformStatic("```animation\nfunction Wave() { secret(); }\n```");
    expect(tree.children[0].type).toBe("paragraph");
    expect(JSON.stringify(tree)).toContain("Animation — view online.");
    expect(JSON.stringify(tree)).not.toContain("secret()");
  });

  it("keeps a mermaid fence as source, which still reads on paper", () => {
    const tree = transformStatic("```mermaid\ngraph TD;\n```");
    expect(tree.children[0].type).toBe("code");
  });
});
