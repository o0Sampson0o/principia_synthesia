// @vitest-environment node
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { remarkCallouts } from "@/lib/remark-callouts";
import { remarkQuoteAttribution } from "@/lib/remark-quote-attribution";

function render(md: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkCallouts)
      .use(remarkQuoteAttribution)
      .use(remarkRehype)
      .use(rehypeStringify)
      .processSync(md)
  );
}

describe("remarkQuoteAttribution", () => {
  it("lifts a `> --- Author` paragraph into a footer with the em-dash rule", () => {
    const html = render("> The quote.\n>\n> --- Metaphysics");
    expect(html).toContain('<footer class="quote-attribution">——— Metaphysics</footer>');
    expect(html).toContain("The quote.");
    expect(html).not.toContain("---");
  });

  it("handles the attribution on the quote's own paragraph (soft break)", () => {
    const html = render("> The quote.\n> --- On the Soul");
    expect(html).toContain('<footer class="quote-attribution">——— On the Soul</footer>');
    expect(html).toContain("The quote.");
  });

  it("handles the lazy form without a > prefix", () => {
    const html = render("> The quote.\n---  Metaphysics");
    expect(html).toContain('<footer class="quote-attribution">——— Metaphysics</footer>');
  });

  it("accepts an em dash marker and preserves inline formatting", () => {
    const html = render("> The quote.\n>\n> — Aristotle, *Metaphysics*");
    expect(html).toContain("——— Aristotle, ");
    expect(html).toContain("<em>Metaphysics</em>");
    expect(html).toContain('class="quote-attribution"');
  });

  it("leaves blockquotes without a marker untouched", () => {
    const html = render("> Just a quote.\n> Second line.");
    expect(html).not.toContain("quote-attribution");
    expect(html).toContain("Just a quote.");
  });

  it("does not treat a mid-quote dash line as attribution", () => {
    const html = render("> First.\n> --- middle\n> Last line.");
    expect(html).not.toContain("quote-attribution");
  });

  it("ignores a lone attribution with no quote body", () => {
    const html = render("> --- Author");
    expect(html).not.toContain("quote-attribution");
  });

  it("does not fire inside callouts", () => {
    const html = render("> [!tip] Title\n> Body.\n> --- Author");
    expect(html).toContain("callout-tip");
    expect(html).not.toContain("quote-attribution");
  });

  it("keeps a thematic break after a blockquote out of the quote", () => {
    const html = render("> Quote.\n\n---\n\nNext section.");
    expect(html).toContain("<hr>");
    expect(html).not.toContain("quote-attribution");
  });
});
