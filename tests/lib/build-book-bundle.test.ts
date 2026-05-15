// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/pdf/render-book-html", () => ({
  mdxToHtml: vi.fn(async () => "<p>content</p>"),
  cleanMdx: vi.fn((s: string) => s),
  PRINT_CSS: "",
}));

import { buildBookBundle } from "@/lib/bundle/build-book-bundle";

const BOOK_SLUG = "test-book";
const BOOK_TITLE = "Test Book";

describe("buildBookBundle", () => {
  it("returns an ArrayBuffer when called with one chapter", async () => {
    const chapters = [{ title: "Introduction", content: "# Hello", partTitle: null }];
    const result = await buildBookBundle(BOOK_SLUG, BOOK_TITLE, chapters, new Map());
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("returns a buffer with non-zero byteLength for a single chapter", async () => {
    const chapters = [{ title: "Introduction", content: "# Hello", partTitle: null }];
    const result = await buildBookBundle(BOOK_SLUG, BOOK_TITLE, chapters, new Map());
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("returns an ArrayBuffer even when called with zero chapters", async () => {
    const result = await buildBookBundle(BOOK_SLUG, BOOK_TITLE, [], new Map());
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });
});
