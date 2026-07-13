// @vitest-environment node
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { remarkColumns } from "@/lib/remark-columns";

function render(md: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkDirective)
      .use(remarkColumns)
      .use(remarkRehype)
      .use(rehypeStringify)
      .processSync(md)
  );
}

describe("remarkColumns", () => {
  it("renders a columns container with column children", () => {
    const html = render(
      ["::::columns", ":::column", "Left.", ":::", ":::column", "Right.", ":::", "::::"].join("\n")
    );
    expect(html).toContain('class="columns"');
    expect((html.match(/class="column"/g) ?? []).length).toBe(2);
    expect(html).toContain("Left.");
    expect(html).toContain("Right.");
  });

  it("applies a width hint to a column's flex-basis", () => {
    const html = render(
      ["::::columns", ":::column{width=30}", "A", ":::", ":::column", "B", ":::", "::::"].join("\n")
    );
    expect(html).toContain("flex: 0 0 30%");
  });

  it("ignores unrelated container directives", () => {
    const html = render([":::note", "hi", ":::"].join("\n"));
    expect(html).not.toContain('class="columns"');
    expect(html).not.toContain('class="column"');
  });

  it("reverts stray inline directives so prose survives (no corruption)", () => {
    expect(render("Meet at 12:30 today.")).toContain("12:30");
    expect(render("A ratio like 3:4 here.")).toContain("3:4");
    const withWord = render("See :note for details.");
    expect(withWord).toContain(":note");
    expect(withWord).not.toContain("<div");
  });
});
