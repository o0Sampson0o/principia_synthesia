import { describe, it, expect } from "vitest";
import { extractCitationSlugs } from "@/lib/citations-extract";

describe("extractCitationSlugs", () => {
  it("returns empty array for MDX with no Cite elements", () => {
    expect(extractCitationSlugs("# Hello\n\nNo citations here.")).toEqual([]);
  });

  it("extracts a single self-closing Cite", () => {
    const mdx = `Some text <Cite slug="alice/article-intro" /> more text.`;
    expect(extractCitationSlugs(mdx)).toEqual(["alice/article-intro"]);
  });

  it("extracts multiple Cite elements in order", () => {
    const mdx = `
<Cite slug="alice/article-topology" />
<Cite slug="bob/article-analysis" />
    `;
    expect(extractCitationSlugs(mdx)).toEqual([
      "alice/article-topology",
      "bob/article-analysis",
    ]);
  });

  it("deduplicates repeated slugs, preserving first-appearance order", () => {
    const mdx = `
<Cite slug="alice/article-first" />
<Cite slug="bob/article-second" />
<Cite slug="alice/article-first" />
    `;
    expect(extractCitationSlugs(mdx)).toEqual([
      "alice/article-first",
      "bob/article-second",
    ]);
  });

  it("handles attribute whitespace variations", () => {
    const mdx = `<Cite   slug  =  "alice/article-spaced"  />`;
    expect(extractCitationSlugs(mdx)).toEqual(["alice/article-spaced"]);
  });

  it("handles single-quoted slug attribute", () => {
    const mdx = `<Cite slug='alice/article-single-quote' />`;
    expect(extractCitationSlugs(mdx)).toEqual(["alice/article-single-quote"]);
  });

  it("trims whitespace from slug values", () => {
    const mdx = `<Cite slug=" alice/article-trimmed " />`;
    expect(extractCitationSlugs(mdx)).toEqual(["alice/article-trimmed"]);
  });

  it("does not extract Cite elements that lack a slug attribute", () => {
    const mdx = `<Cite number="1" />`;
    expect(extractCitationSlugs(mdx)).toEqual([]);
  });

  it("does not match non-Cite JSX elements", () => {
    const mdx = `<DynamicAnimation slug="anim-foo" /><Cite slug="alice/article-real" />`;
    expect(extractCitationSlugs(mdx)).toEqual(["alice/article-real"]);
  });

  it("handles a paired (non-self-closing) Cite tag", () => {
    // The regex matches <Cite slug="..."> (open tag) — paired form
    const mdx = `<Cite slug="alice/article-paired"></Cite>`;
    expect(extractCitationSlugs(mdx)).toEqual(["alice/article-paired"]);
  });
});
