// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// Pass-through rather than a fixed string: animation inlining happens before
// mdxToHtml, so a discarding mock would hide it from these assertions.
vi.mock("@/lib/pdf/render-book-html", () => ({
  mdxToHtml: vi.fn(async (s: string) => s),
  cleanMdx: vi.fn((s: string) => s),
  PRINT_CSS: "",
}));

import { buildBookBundle } from "@/lib/bundle/build-book-bundle";
import { defaultLight } from "@/lib/theme";
import JSZip from "jszip";

const BOOK_SLUG = "test-book";
const BOOK_TITLE = "Test Book";

describe("buildBookBundle", () => {
  it("returns an ArrayBuffer when called with one chapter", async () => {
    const chapters = [{ title: "Introduction", content: "# Hello", partTitle: null, chapterTitle: null }];
    const result = await buildBookBundle(BOOK_SLUG, BOOK_TITLE, chapters, new Map(), defaultLight);
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("returns a buffer with non-zero byteLength for a single chapter", async () => {
    const chapters = [{ title: "Introduction", content: "# Hello", partTitle: null, chapterTitle: null }];
    const result = await buildBookBundle(BOOK_SLUG, BOOK_TITLE, chapters, new Map(), defaultLight);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("exposes window.theme to inlined animations", async () => {
    // Without this the exported copy throws on `window.theme.foreground`, which
    // is exactly what the in-app editor tells animation authors to rely on.
    const chapters = [
      {
        title: "Sim",
        content: `<DynamicAnimation publisher="p" slug="anim-x" />`,
        partTitle: null,
        chapterTitle: null,
      },
    ];
    const anims = new Map([["anim-x", { code: "function A(){}", height: 400 }]]);
    const result = await buildBookBundle(BOOK_SLUG, BOOK_TITLE, chapters, anims, defaultLight);

    const zip = await JSZip.loadAsync(result);
    const page = Object.keys(zip.files).find(
      (f) => f.startsWith("chapters/") && f.endsWith(".html")
    )!;
    const html = await zip.file(page)!.async("string");

    expect(html).toContain("window.theme =");
    expect(html).toContain(defaultLight.foreground);
    // The palette must be defined before the animation script that reads it.
    expect(html.indexOf("window.theme =")).toBeLessThan(html.indexOf("function A()"));
  });

  it("uses the stored frame height for the exported canvas", async () => {
    const chapters = [
      {
        title: "Sim",
        content: `<DynamicAnimation publisher="p" slug="anim-x" />`,
        partTitle: null,
        chapterTitle: null,
      },
    ];
    const anims = new Map([["anim-x", { code: "function A(){}", height: 720 }]]);
    const result = await buildBookBundle(BOOK_SLUG, BOOK_TITLE, chapters, anims, defaultLight);
    const zip = await JSZip.loadAsync(result);
    const page = Object.keys(zip.files).find(
      (f) => f.startsWith("chapters/") && f.endsWith(".html")
    )!;
    const html = await zip.file(page)!.async("string");
    expect(html).toContain('height="720"');
  });

  it("returns an ArrayBuffer even when called with zero chapters", async () => {
    const result = await buildBookBundle(BOOK_SLUG, BOOK_TITLE, [], new Map(), defaultLight);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });
});
