import { describe, it, expect } from "vitest";
import { excerptHtml, firstParagraph } from "@/lib/preview-excerpt";

describe("firstParagraph", () => {
  it("skips headings, code, display maths and callouts to reach the prose", () => {
    const body = [
      "# Title",
      "",
      "> [!note] A callout",
      "",
      "```js",
      "code()",
      "```",
      "",
      "$$",
      "E = mc^2",
      "$$",
      "",
      "A **group** is a set with an operation.",
      "It has an identity.",
      "",
      "Second paragraph.",
    ].join("\n");
    expect(firstParagraph(body)).toBe("A group is a set with an operation. It has an identity.");
  });

  it("reduces links and wikilinks to their text, drops references", () => {
    const body = "See [[alice:articles:article-sets|Sets]] and [Kepler](/k) \\cite{newton}.";
    expect(firstParagraph(body)).toBe("See Sets and Kepler.");
  });

  it("keeps inline maths and never truncates inside it", () => {
    const body = "Let $x \\in \\mathbb{R}^n$ be a vector and " + "word ".repeat(80);
    const out = firstParagraph(body, 60);
    expect(out.endsWith("…")).toBe(true);
    expect((out.match(/\$/g) ?? []).length % 2).toBe(0);
    expect(out).toContain("$x \\in \\mathbb{R}^n$");
  });

  it("returns empty for a body with no prose", () => {
    expect(firstParagraph("# Only a heading\n\n```\nx\n```")).toBe("");
  });
});

describe("excerptHtml", () => {
  it("escapes HTML and typesets inline maths", () => {
    const html = excerptHtml("a <b> & $x^2$");
    expect(html).toContain("a &lt;b&gt; &amp; ");
    expect(html).toContain('class="katex"');
    expect(html).not.toContain("<b>");
  });

  it("renders a bad formula as its source instead of throwing", () => {
    expect(() => excerptHtml("$\\frac{$")).not.toThrow();
  });
});
