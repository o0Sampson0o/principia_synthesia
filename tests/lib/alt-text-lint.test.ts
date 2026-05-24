import { describe, it, expect } from "vitest";
import { findMissingAlt } from "@/lib/alt-text-lint";

describe("findMissingAlt", () => {
  it("returns empty array for clean content", () => {
    const mdx = `# Hello\n\n![A nice image](photo.jpg)\n\nSome text.`;
    expect(findMissingAlt(mdx)).toEqual([]);
  });

  it("detects markdown empty alt []( )", () => {
    const mdx = `![](photo.jpg)`;
    const result = findMissingAlt(mdx);
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(1);
    expect(result[0].src).toBe("photo.jpg");
  });

  it("detects HTML img without alt attribute", () => {
    const mdx = `<img src="photo.jpg" width="100" />`;
    const result = findMissingAlt(mdx);
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(1);
    expect(result[0].src).toBe("photo.jpg");
  });

  it("does NOT flag HTML img with alt attribute", () => {
    const mdx = `<img src="photo.jpg" alt="A photo" />`;
    expect(findMissingAlt(mdx)).toHaveLength(0);
  });

  it("does NOT flag img with alt='' and role='presentation' (decorative)", () => {
    const mdx = `<img src="deco.png" alt="" role="presentation" />`;
    expect(findMissingAlt(mdx)).toHaveLength(0);
  });

  it("flags img with empty alt but no role=presentation", () => {
    const mdx = `<img src="deco.png" alt="" />`;
    const result = findMissingAlt(mdx);
    expect(result).toHaveLength(1);
  });

  it("detects ArticleImage without alt prop", () => {
    const mdx = `<ArticleImage src="figure.png" width={800} />`;
    const result = findMissingAlt(mdx);
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(1);
  });

  it("does NOT flag ArticleImage with alt prop", () => {
    const mdx = `<ArticleImage src="figure.png" alt="A figure" />`;
    expect(findMissingAlt(mdx)).toHaveLength(0);
  });

  it("returns findings sorted by line number", () => {
    const mdx = [
      "Normal text",
      "![](a.jpg)",
      "More text",
      "<img src='b.jpg' />",
      "![](c.jpg)",
    ].join("\n");
    const result = findMissingAlt(mdx);
    expect(result.length).toBe(3);
    expect(result[0].line).toBeLessThanOrEqual(result[1].line);
    expect(result[1].line).toBeLessThanOrEqual(result[2].line);
  });

  it("handles mixed input returning correct counts", () => {
    const mdx = [
      "![alt text](good.jpg)",
      "![](bad.jpg)",
      "<img src='no-alt.jpg' />",
      '<img src="has-alt.jpg" alt="OK" />',
    ].join("\n");
    const result = findMissingAlt(mdx);
    expect(result.length).toBe(2);
  });

  it("does NOT flag img with single-quoted non-empty alt", () => {
    const mdx = `<img src="photo.jpg" alt='Hello world' />`;
    expect(findMissingAlt(mdx)).toHaveLength(0);
  });
});
