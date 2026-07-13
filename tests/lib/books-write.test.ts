// @vitest-environment node
import { describe, it, expect } from "vitest";
import { computeStructureHash } from "@/lib/books-write";

describe("computeStructureHash", () => {
  it("is order-sensitive (a reorder changes the hash)", () => {
    const a = [
      { articleSlug: "article-one", partTitle: "Part I" },
      { articleSlug: "article-two", partTitle: "Part I" },
    ];
    const reordered = [a[1], a[0]];
    expect(computeStructureHash(a)).not.toBe(computeStructureHash(reordered));
  });

  it("is sensitive to part-title changes", () => {
    const base = [{ articleSlug: "article-one", partTitle: "Part I" }];
    const moved = [{ articleSlug: "article-one", partTitle: "Part II" }];
    expect(computeStructureHash(base)).not.toBe(computeStructureHash(moved));
  });

  it("treats null and empty part titles identically (both 'no part')", () => {
    const withNull = [{ articleSlug: "article-one", partTitle: null }];
    const withEmpty = [{ articleSlug: "article-one", partTitle: "" }];
    expect(computeStructureHash(withNull)).toBe(computeStructureHash(withEmpty));
  });

  it("is stable for identical input", () => {
    const chapters = [
      { articleSlug: "article-a", partTitle: "P" },
      { articleSlug: "article-b", partTitle: null },
    ];
    expect(computeStructureHash(chapters)).toBe(computeStructureHash([...chapters]));
  });
});
