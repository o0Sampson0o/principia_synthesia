import { describe, it, expect } from "vitest";
import {
  parseOutline,
  planOutlineSave,
  sectionSlugBase,
  type SavedOutlineRow,
} from "@/lib/book-outline";
import { slugifyTitle, uniqueSlug, normalizePrefixedSlug } from "@/lib/slugify";

describe("slugifyTitle", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyTitle("Groups, Rings & Fields")).toBe("groups-rings-fields");
  });
  it("drops TeX control words from inline maths", () => {
    expect(slugifyTitle("The space $\\mathbb{R}^n$")).toBe("the-space-r-n");
  });
  it("folds accents to ASCII", () => {
    expect(slugifyTitle("Poincaré’s théorème")).toBe("poincare-s-theoreme");
  });
  it("returns empty when nothing survives", () => {
    expect(slugifyTitle("$\\alpha$ — ∞")).toBe("");
  });
  it("truncates without leaving a trailing hyphen", () => {
    const s = slugifyTitle("a ".repeat(40), 10);
    expect(s.length).toBeLessThanOrEqual(10);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug / sectionSlugBase", () => {
  it("prefixes and falls back for symbol-only titles", () => {
    expect(sectionSlugBase("Introduction")).toBe("article-introduction");
    expect(sectionSlugBase("∞")).toBe("article-section");
  });
  it("suffixes -2, -3 against taken slugs and records each pick", () => {
    const taken = new Set(["article-intro"]);
    expect(uniqueSlug("article-intro", taken)).toBe("article-intro-2");
    expect(uniqueSlug("article-intro", taken)).toBe("article-intro-3");
    expect(taken.has("article-intro-3")).toBe(true);
  });
});

describe("normalizePrefixedSlug", () => {
  it("adds the prefix when the author left it off", () => {
    expect(normalizePrefixedSlug("book-", "my-book")).toBe("book-my-book");
  });
  it("keeps a typed prefix without doubling it", () => {
    expect(normalizePrefixedSlug("book-", "book-my-book")).toBe("book-my-book");
  });
  it("cleans spaces and case", () => {
    expect(normalizePrefixedSlug("book-", "  Linear Algebra ")).toBe("book-linear-algebra");
  });
  it("is null for a blank field", () => {
    expect(normalizePrefixedSlug("book-", "   ")).toBeNull();
  });
});

describe("parseOutline", () => {
  it("maps markdown heading levels to part / chapter / section", () => {
    expect(parseOutline("# Foundations\n## Sets\n### Intro\n- Functions")).toEqual([
      { kind: "part", title: "Foundations" },
      { kind: "chapter", title: "Sets" },
      { kind: "section", title: "Intro" },
      { kind: "section", title: "Functions" },
    ]);
  });

  it("plain lines are sections", () => {
    expect(parseOutline("Intro\n\nBasics\r\nAdvanced")).toEqual([
      { kind: "section", title: "Intro" },
      { kind: "section", title: "Basics" },
      { kind: "section", title: "Advanced" },
    ]);
  });

  it("two-level list: parents become chapters", () => {
    expect(parseOutline("- Sets\n  - Intro\n  - Subsets\n- Maps\n  - Injective")).toEqual([
      { kind: "chapter", title: "Sets" },
      { kind: "section", title: "Intro" },
      { kind: "section", title: "Subsets" },
      { kind: "chapter", title: "Maps" },
      { kind: "section", title: "Injective" },
    ]);
  });

  it("three-level list (tabs or 4 spaces): top becomes a part", () => {
    expect(parseOutline("1. Algebra\n\t1. Groups\n\t\t1. Axioms\n\t2. Rings")).toEqual([
      { kind: "part", title: "Algebra" },
      { kind: "chapter", title: "Groups" },
      { kind: "section", title: "Axioms" },
      { kind: "section", title: "Rings" },
    ]);
  });

  it("a childless item next to a parent stays a section", () => {
    expect(parseOutline("- Preface\n- Sets\n    - Intro")).toEqual([
      { kind: "section", title: "Preface" },
      { kind: "chapter", title: "Sets" },
      { kind: "section", title: "Intro" },
    ]);
  });

  it("explicit Part / Chapter numerals win in a flat copied TOC", () => {
    expect(parseOutline("Part I: Foundations\nChapter 1. Sets\nWhat is a set?\nPart of speech")).toEqual([
      { kind: "part", title: "Part I: Foundations" },
      { kind: "chapter", title: "Chapter 1. Sets" },
      { kind: "section", title: "What is a set?" },
      { kind: "section", title: "Part of speech" },
    ]);
  });

  it("strips mdBook links and checkboxes", () => {
    expect(parseOutline("- [Getting started](start.md)\n- [ ] Todo section")).toEqual([
      { kind: "section", title: "Getting started" },
      { kind: "section", title: "Todo section" },
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(parseOutline("  \n\n ")).toEqual([]);
  });
});

describe("planOutlineSave", () => {
  const saved: SavedOutlineRow[] = [
    { entryId: 1, articleId: null, kind: "part", title: "Part A", isInternal: false },
    { entryId: 2, articleId: 20, kind: "section", title: null, isInternal: true },
    { entryId: 3, articleId: 30, kind: "section", title: null, isInternal: false },
  ];
  const base = [1, 2, 3];

  it("refuses a stale base", () => {
    const r = planOutlineSave({ saved, baseIds: [1, 3, 2], items: [], takenSlugs: new Set() });
    expect(r).toHaveProperty("error");
  });

  it("keeps, reorders, renames, adds and removes in one plan", () => {
    const taken = new Set(["article-intro"]);
    const r = planOutlineSave({
      saved,
      baseIds: base,
      takenSlugs: taken,
      items: [
        { kind: "section", entryId: 3 },
        { kind: "chapter", entryId: 1, title: "Renamed" },
        { kind: "section", title: "Intro" },
        { kind: "section", title: "Intro" },
        { kind: "part", title: "New part" },
        { kind: "section", articleId: 99 },
      ],
    });
    expect(r).not.toHaveProperty("error");
    if ("error" in r) return;
    expect(r.rows).toEqual([
      { op: "keep", entryId: 3 },
      { op: "keep", entryId: 1 },
      { op: "new-section", title: "Intro", slug: "article-intro-2" },
      { op: "new-section", title: "Intro", slug: "article-intro-3" },
      { op: "new-divider", kind: "part", title: "New part" },
      { op: "add-article", articleId: 99 },
    ]);
    expect(r.renames).toEqual([{ entryId: 1, title: "Renamed", kind: "chapter" }]);
    // Entry 2 dropped; its article is internal, so the article goes too.
    expect(r.removals).toEqual([{ entryId: 2, deleteArticleId: 20 }]);
  });

  it("removing a standalone section only drops the entry", () => {
    const r = planOutlineSave({
      saved,
      baseIds: base,
      takenSlugs: new Set(),
      items: [{ kind: "part", entryId: 1, title: "Part A" }, { kind: "section", entryId: 2 }],
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.renames).toEqual([]);
    expect(r.removals).toEqual([{ entryId: 3, deleteArticleId: null }]);
  });

  it("rejects adding an article already kept in the book", () => {
    const r = planOutlineSave({
      saved,
      baseIds: base,
      takenSlugs: new Set(),
      items: [{ kind: "section", articleId: 30 }, { kind: "section", entryId: 3 }],
    });
    expect(r).toHaveProperty("error");
  });

  it("rejects entry ids from elsewhere, duplicates, kind swaps and blank titles", () => {
    const cases = [
      [{ kind: "section", entryId: 404 }],
      [{ kind: "section", entryId: 2 }, { kind: "section", entryId: 2 }],
      [{ kind: "section", entryId: 1 }],
      [{ kind: "part", entryId: 2, title: "x" }],
      [{ kind: "section", title: "   " }],
      [{ kind: "chapter", title: "" }],
    ] as const;
    for (const items of cases) {
      const r = planOutlineSave({ saved, baseIds: base, takenSlugs: new Set(), items: [...items] });
      expect(r, JSON.stringify(items)).toHaveProperty("error");
    }
  });
});
