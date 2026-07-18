// @vitest-environment node
import { describe, it, expect } from "vitest";
import { computeStructureHash } from "@/lib/books-write";

describe("computeStructureHash", () => {
  it("is order-sensitive (a reorder changes the hash)", () => {
    const a = [
      { articleSlug: "article-one", partTitle: "Part I", chapterTitle: null },
      { articleSlug: "article-two", partTitle: "Part I", chapterTitle: null },
    ];
    const reordered = [a[1], a[0]];
    expect(computeStructureHash(a)).not.toBe(computeStructureHash(reordered));
  });

  it("is sensitive to part-title changes", () => {
    const base = [{ articleSlug: "article-one", partTitle: "Part I", chapterTitle: null }];
    const moved = [{ articleSlug: "article-one", partTitle: "Part II", chapterTitle: null }];
    expect(computeStructureHash(base)).not.toBe(computeStructureHash(moved));
  });

  it("is sensitive to chapter-title changes", () => {
    const base = [{ articleSlug: "article-one", partTitle: "Part I", chapterTitle: "Chapter 1" }];
    const moved = [{ articleSlug: "article-one", partTitle: "Part I", chapterTitle: "Chapter 2" }];
    expect(computeStructureHash(base)).not.toBe(computeStructureHash(moved));
  });

  it("treats null and empty part titles identically (both 'no part')", () => {
    const withNull = [{ articleSlug: "article-one", partTitle: null, chapterTitle: null }];
    const withEmpty = [{ articleSlug: "article-one", partTitle: "", chapterTitle: null }];
    expect(computeStructureHash(withNull)).toBe(computeStructureHash(withEmpty));
  });

  it("treats null and empty chapter titles identically", () => {
    const withNull = [{ articleSlug: "article-one", partTitle: null, chapterTitle: null }];
    const withEmpty = [{ articleSlug: "article-one", partTitle: null, chapterTitle: "" }];
    expect(computeStructureHash(withNull)).toBe(computeStructureHash(withEmpty));
  });

  it("is stable for identical input", () => {
    const sections = [
      { articleSlug: "article-a", partTitle: "P", chapterTitle: "C" },
      { articleSlug: "article-b", partTitle: null, chapterTitle: null },
    ];
    expect(computeStructureHash(sections)).toBe(computeStructureHash([...sections]));
  });
});
