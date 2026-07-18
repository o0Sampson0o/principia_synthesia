// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildBookTOC, type TocEntry } from "@/lib/book-toc";

function entry(overrides: Partial<TocEntry> & { bookSlug: string; entryId: number }): TocEntry {
  return {
    bookTitle: "Test Book",
    position: 1,
    partTitle: null,
    chapterTitle: null,
    articleSlug: `article-${overrides.entryId}`,
    articleTitle: `Article ${overrides.entryId}`,
    ...overrides,
  };
}

describe("buildBookTOC", () => {
  it("returns empty object for empty input", () => {
    expect(buildBookTOC([])).toEqual({});
  });

  it("groups entries by bookSlug", () => {
    const entries = [
      entry({ bookSlug: "physics", entryId: 1, bookTitle: "Physics 101", position: 1 }),
      entry({ bookSlug: "math", entryId: 2, bookTitle: "Math 101", position: 1 }),
      entry({ bookSlug: "physics", entryId: 3, bookTitle: "Physics 101", position: 2 }),
    ];
    const result = buildBookTOC(entries);
    expect(Object.keys(result)).toEqual(["physics", "math"]);
    expect(result["physics"].entries).toHaveLength(2);
    expect(result["math"].entries).toHaveLength(1);
  });

  it("uses bookTitle from the first entry in each group", () => {
    const entries = [
      entry({ bookSlug: "physics", entryId: 1, bookTitle: "Physics 101", position: 1 }),
    ];
    expect(buildBookTOC(entries)["physics"].bookTitle).toBe("Physics 101");
  });

  it("preserves entry ordering within a book", () => {
    const entries = [
      entry({ bookSlug: "physics", entryId: 3, position: 3 }),
      entry({ bookSlug: "physics", entryId: 1, position: 1 }),
      entry({ bookSlug: "physics", entryId: 2, position: 2 }),
    ];
    const ids = buildBookTOC(entries)["physics"].entries.map((e) => e.entryId);
    expect(ids).toEqual([3, 1, 2]); // preserved as-is; caller is responsible for sorting
  });

  it("handles entries with part titles", () => {
    const entries = [
      entry({ bookSlug: "b", entryId: 1, partTitle: "Part A" }),
      entry({ bookSlug: "b", entryId: 2, partTitle: "Part B" }),
    ];
    const result = buildBookTOC(entries)["b"].entries;
    expect(result[0].partTitle).toBe("Part A");
    expect(result[1].partTitle).toBe("Part B");
  });

  it("handles a single entry", () => {
    const entries = [entry({ bookSlug: "solo", entryId: 99 })];
    const result = buildBookTOC(entries);
    expect(result["solo"].entries).toHaveLength(1);
  });
});
