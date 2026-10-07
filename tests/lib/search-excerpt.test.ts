import { describe, it, expect } from "vitest";
import { plainText, searchExcerpt } from "@/lib/search-excerpt";

describe("plainText", () => {
  it("drops markdown syntax but keeps prose and maths", () => {
    const md = "---\ntitle: x\n---\n# Heading\n\nSome **bold** and [a link](http://x) and [[slug|Label]] with $E=mc^2$.\n\n```js\ncode()\n```\n> [!note] Callout\n> body";
    const t = plainText(md);
    expect(t).toContain("Heading Some bold and a link and Label with $E=mc^2$.");
    expect(t).not.toContain("code()");
    expect(t).not.toContain("title:");
    expect(t).toContain("Callout body");
  });
});

describe("searchExcerpt", () => {
  const body = "Lorem ipsum dolor sit amet. ".repeat(10) + "The Entropy of a closed system never decreases. " + "Consectetur adipiscing elit. ".repeat(10);

  it("finds the first case-insensitive match with context and ellipses", () => {
    const e = searchExcerpt(body, "entropy")!;
    expect(e.match).toBe("Entropy");
    expect(e.before.startsWith("…")).toBe(true);
    expect(e.after.endsWith("…")).toBe(true);
    expect(e.before.length).toBeLessThanOrEqual(92);
    expect(e.after).toContain("closed system");
  });

  it("does not cut words at the edges", () => {
    const e = searchExcerpt(body, "entropy")!;
    expect(e.before.slice(1, 2)).not.toBe(" ");
    expect(/\S…$/.test(e.after)).toBe(true);
  });

  it("returns null when the body has no match or the query is blank", () => {
    expect(searchExcerpt(body, "quantum")).toBeNull();
    expect(searchExcerpt(body, "  ")).toBeNull();
  });

  it("omits ellipses when the passage reaches the start or end", () => {
    const e = searchExcerpt("Entropy rises.", "entropy")!;
    expect(e.before).toBe("");
    expect(e.after).toBe(" rises.");
  });
});
