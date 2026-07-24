// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  buildBookStructure,
  resolvePath,
  dividerHref,
  sectionHref,
  type CurriculumRow,
  type ChapterNode,
} from "@/lib/book-structure";

let aid = 0;
function section(position: number, slug: string, title = slug): CurriculumRow {
  return {
    articleId: ++aid,
    position,
    partTitle: null,
    dividerLevel: null,
    articleSlug: slug,
    articleTitle: title,
    articlePublisherSlug: "pub",
  };
}
function divider(
  position: number,
  title: string,
  dividerLevel: "part" | "chapter" | null
): CurriculumRow {
  return {
    articleId: null,
    position,
    partTitle: title,
    dividerLevel,
    articleSlug: null,
    articleTitle: null,
    articlePublisherSlug: null,
  };
}

describe("buildBookStructure", () => {
  it("nests sections under the current chapter and part", () => {
    const s = buildBookStructure([
      divider(0, "Foundations", "part"),
      divider(1, "Basics", "chapter"),
      section(2, "article-a"),
      section(3, "article-b"),
    ]);
    expect(s.parts).toHaveLength(1);
    const part = s.parts[0];
    expect(part.slug).toBe("foundations");
    expect(part.children).toHaveLength(1);
    const chapter = part.children[0] as ChapterNode;
    expect(chapter.kind).toBe("chapter");
    expect(chapter.slug).toBe("basics");
    expect(chapter.children.map((c) => c.slug)).toEqual(["article-a", "article-b"]);
    expect(s.orderedSections.map((x) => x.slug)).toEqual(["article-a", "article-b"]);

    const loc = s.articleIndex.get("article-b")!;
    expect(loc.part?.slug).toBe("foundations");
    expect(loc.chapter?.slug).toBe("basics");
    expect(loc.flatIndex).toBe(1);
  });

  it("a part closes the open chapter (positional ownership)", () => {
    const s = buildBookStructure([
      divider(0, "Part One", "part"),
      divider(1, "Chapter One", "chapter"),
      section(2, "a"),
      divider(3, "Part Two", "part"),
      section(4, "b"), // belongs directly to Part Two, not Chapter One
    ]);
    const locB = s.articleIndex.get("b")!;
    expect(locB.part?.slug).toBe("part-two");
    expect(locB.chapter).toBeNull();
    expect(s.parts[1].children.map((c) => c.slug)).toEqual(["b"]);
  });

  it("treats a legacy NULL dividerLevel as a part", () => {
    const s = buildBookStructure([divider(0, "Legacy", null), section(1, "a")]);
    expect(s.parts).toHaveLength(1);
    expect(s.parts[0].slug).toBe("legacy");
    expect(s.articleIndex.get("a")!.part?.slug).toBe("legacy");
  });

  it("attaches root-level sections/chapters before any part to the book", () => {
    const s = buildBookStructure([
      section(0, "intro"), // no part/chapter yet → book root
      divider(1, "Prelude", "chapter"), // chapter before any part → root
      section(2, "a"),
    ]);
    expect(s.children[0].kind).toBe("section");
    expect(s.children[1].kind).toBe("chapter");
    expect(s.articleIndex.get("intro")!.part).toBeNull();
    expect(s.articleIndex.get("a")!.chapter?.slug).toBe("prelude");
    expect(s.articleIndex.get("a")!.part).toBeNull();
  });

  it("dedups divider slugs deterministically (x, x-1)", () => {
    const s = buildBookStructure([
      divider(0, "Overview", "part"),
      divider(1, "Overview", "chapter"),
    ]);
    expect([...s.dividerIndex.keys()].sort()).toEqual(["overview", "overview-1"]);
  });

  it("suffixes a divider slug that would collide with an article slug", () => {
    // Divider titled "Intro" would slugify to "intro", which is an article slug.
    const s = buildBookStructure([
      section(0, "intro", "Intro Section"),
      divider(1, "Intro", "part"),
      section(2, "a"),
    ]);
    // The article keeps "intro"; the divider gets a bumped slug.
    const dividerKeys = [...s.dividerIndex.keys()];
    expect(dividerKeys).not.toContain("intro");
    expect(dividerKeys).toHaveLength(1);
    // Article still wins when resolving "intro".
    expect(resolvePath(s, ["intro"])!.type).toBe("article");
    // The part is reachable via its bumped slug.
    expect(resolvePath(s, [dividerKeys[0]])!.type).toBe("divider");
  });
});

describe("resolvePath (flexible URLs)", () => {
  const s = buildBookStructure([
    divider(0, "Part One", "part"),
    divider(1, "Chapter One", "chapter"),
    section(2, "article-a"),
  ]);

  it("resolves by the last segment regardless of intermediate segments", () => {
    for (const path of [
      ["part-one", "chapter-one", "article-a"],
      ["part-one", "article-a"],
      ["article-a"], // backward-compatible 2-seg URL
      ["nonsense", "article-a"], // intermediate ignored
    ]) {
      const r = resolvePath(s, path);
      expect(r?.type).toBe("article");
    }
  });

  it("resolves a chapter and a part TOC target", () => {
    expect(resolvePath(s, ["part-one", "chapter-one"])?.type).toBe("divider");
    expect(resolvePath(s, ["part-one"])?.type).toBe("divider");
    const chapter = resolvePath(s, ["chapter-one"]);
    expect(chapter?.type).toBe("divider");
    if (chapter?.type === "divider") expect(chapter.part?.slug).toBe("part-one");
  });

  it("returns null for an unknown last segment or empty path", () => {
    expect(resolvePath(s, ["does-not-exist"])).toBeNull();
    expect(resolvePath(s, [])).toBeNull();
  });
});

describe("href helpers", () => {
  it("builds nested chapter URLs and flat section URLs", () => {
    const s = buildBookStructure([
      divider(0, "Part One", "part"),
      divider(1, "Chapter One", "chapter"),
      divider(2, "Loose Chapter", "chapter"), // still under Part One
    ]);
    const withParent = s.dividerIndex.get("chapter-one") as ChapterNode;
    expect(dividerHref("pub", "book", withParent)).toBe("/pub/books/book/part-one/chapter-one");
    expect(dividerHref("pub", "book", s.parts[0])).toBe("/pub/books/book/part-one");
    expect(sectionHref("pub", "book", "a")).toBe("/pub/books/book/a");

    // A chapter with no parent part uses the flat form.
    const rootChapter = buildBookStructure([divider(0, "Solo", "chapter")]).dividerIndex.get(
      "solo"
    ) as ChapterNode;
    expect(dividerHref("pub", "book", rootChapter)).toBe("/pub/books/book/solo");
  });
});
