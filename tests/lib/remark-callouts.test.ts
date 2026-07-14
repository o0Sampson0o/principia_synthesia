// @vitest-environment node
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { remarkCallouts } from "@/lib/remark-callouts";

function render(md: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkCallouts)
      .use(remarkRehype)
      .use(rehypeStringify)
      .processSync(md)
  );
}

describe("remarkCallouts", () => {
  it("turns > [!note] into a callout div with a title", () => {
    const html = render("> [!note] Heads up\n> Body text.");
    expect(html).toContain('class="callout callout-note"');
    expect(html).toContain('data-callout="note"');
    expect(html).toContain('class="callout-title"');
    expect(html).toContain("Heads up");
    expect(html).toContain("Body text.");
  });

  it("defaults the title to the capitalized type when none is given", () => {
    const html = render("> [!warning]\n> Careful.");
    expect(html).toContain("callout-warning");
    expect(html).toContain(">Warning<");
  });

  it("maps unknown types to note", () => {
    const html = render("> [!zzz] X\n> y");
    expect(html).toContain("callout-note");
  });

  it("renders foldable callouts (+/-) as a native <details>", () => {
    const open = render("> [!faq]+ Q\n> a");
    expect(open).toContain("<details");
    expect(open).toContain("<summary");
    expect(open).toContain('class="callout callout-faq"');
    expect(open).toMatch(/<details[^>]*\sopen[^>]*>/); // + starts open
    const closed = render("> [!faq]- Q\n> a");
    expect(closed).toContain("<details");
    expect(closed).not.toMatch(/<details[^>]*\sopen[^>]*>/); // - starts collapsed
  });

  it("keeps non-foldable callouts as a plain <div> (not collapsible)", () => {
    const html = render("> [!note] Heads up\n> Body.");
    expect(html).toContain('<div class="callout callout-note"');
    expect(html).not.toContain("<details");
  });

  it("leaves an ordinary blockquote untouched", () => {
    const html = render("> just a quote\n> second line");
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("callout");
  });

  it("handles a title-only callout (no body)", () => {
    const html = render("> [!tip] Just a tip");
    expect(html).toContain("callout-tip");
    expect(html).toContain("Just a tip");
  });
});
