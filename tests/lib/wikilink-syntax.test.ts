// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseWikilink, wikilinkRe, formatWikilink } from "@/lib/wikilink-syntax";

describe("parseWikilink", () => {
  it("parses the three-segment form", () => {
    expect(parseWikilink("[[alice:articles:article-x]]")).toEqual({
      publisher: "alice",
      type: "articles",
      slug: "article-x",
      section: null,
      label: null,
      href: "/alice/articles/article-x",
      display: "article-x",
    });
  });

  it("parses the labeled form", () => {
    const p = parseWikilink("[[pub:books:book-physics|The Physics Book]]");
    expect(p?.href).toBe("/pub/books/book-physics");
    expect(p?.display).toBe("The Physics Book");
    expect(p?.label).toBe("The Physics Book");
  });

  it("rejects invalid types, casing, and partial matches", () => {
    expect(parseWikilink("[[pub:widgets:x]]")).toBeNull();
    expect(parseWikilink("[[Pub:articles:x]]")).toBeNull();
    expect(parseWikilink("[[pub:articles:x]] trailing")).toBeNull();
    expect(parseWikilink("[[plain wikilink]]")).toBeNull();
  });
});

describe("parseWikilink — book section form", () => {
  it("parses the four-segment book:section form", () => {
    expect(parseWikilink("[[alice:books:relativity:intro]]")).toEqual({
      publisher: "alice",
      type: "books",
      slug: "relativity",
      section: "intro",
      label: null,
      href: "/alice/books/relativity/intro",
      display: "intro",
    });
  });

  it("lets two books disambiguate a shared section slug", () => {
    const a = parseWikilink("[[pub:books:relativity:intro]]");
    const b = parseWikilink("[[pub:books:mechanics:intro]]");
    expect(a?.href).toBe("/pub/books/relativity/intro");
    expect(b?.href).toBe("/pub/books/mechanics/intro");
    expect(a?.href).not.toBe(b?.href);
  });

  it("supports a label on the section form", () => {
    const p = parseWikilink("[[pub:books:relativity:intro|Introduction]]");
    expect(p?.href).toBe("/pub/books/relativity/intro");
    expect(p?.display).toBe("Introduction");
    expect(p?.section).toBe("intro");
  });

  it("rejects a section on a non-book type", () => {
    // `[[pub:articles:a:b]]` has no meaningful target — it must stay literal
    // text rather than resolving to some invented URL.
    expect(parseWikilink("[[pub:articles:a:b]]")).toBeNull();
    expect(parseWikilink("[[pub:objects:a:b]]")).toBeNull();
  });

  it("still resolves a plain book link with no section", () => {
    const p = parseWikilink("[[pub:books:relativity]]");
    expect(p?.href).toBe("/pub/books/relativity");
    expect(p?.section).toBeNull();
  });
});

describe("wikilinkRe (scanning form)", () => {
  it("finds all links in prose, matching remarkWikilinks behavior", () => {
    const text = "see [[a:articles:article-x]] and [[b:objects:object-y|Y]] end";
    const matches = [...text.matchAll(wikilinkRe())];
    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe("a");
    // Group 4 is the optional section, so the label is now group 5.
    expect(matches[1][5]).toBe("Y");
  });

  it("captures the section as group 4", () => {
    const [m] = [..."[[p:books:bk:sec]]".matchAll(wikilinkRe())];
    expect(m[3]).toBe("bk");
    expect(m[4]).toBe("sec");
  });

  it("returns a fresh regex each call (no lastIndex leakage)", () => {
    const a = wikilinkRe();
    a.exec("x [[p:articles:article-a]]");
    expect(wikilinkRe().lastIndex).toBe(0);
  });
});

describe("formatWikilink", () => {
  it("renders the three-segment form", () => {
    expect(formatWikilink({ publisher: "alice", type: "articles", slug: "intro" })).toBe(
      "[[alice:articles:intro]]"
    );
  });

  it("renders the book section form", () => {
    expect(
      formatWikilink({ publisher: "alice", type: "books", slug: "relativity", section: "intro" })
    ).toBe("[[alice:books:relativity:intro]]");
  });

  it("omits the section segment when it is null or absent", () => {
    expect(formatWikilink({ publisher: "a", type: "books", slug: "b", section: null })).toBe(
      "[[a:books:b]]"
    );
    expect(formatWikilink({ publisher: "a", type: "objects", slug: "anim-x" })).toBe(
      "[[a:objects:anim-x]]"
    );
  });

  it("round-trips through parseWikilink", () => {
    // The copy-to-clipboard buttons emit formatWikilink output, so anything it
    // produces must be something the parser accepts and resolves identically.
    const cases = [
      { publisher: "alice", type: "articles" as const, slug: "intro", section: null },
      { publisher: "alice", type: "objects" as const, slug: "anim-orbit", section: null },
      { publisher: "alice", type: "books" as const, slug: "relativity", section: null },
      { publisher: "alice", type: "books" as const, slug: "relativity", section: "intro" },
    ];
    for (const c of cases) {
      const parsed = parseWikilink(formatWikilink(c));
      expect(parsed).not.toBeNull();
      expect(parsed).toMatchObject({
        publisher: c.publisher,
        type: c.type,
        slug: c.slug,
        section: c.section,
      });
    }
  });

  it("produces links the prose scanner also finds", () => {
    const text = `see ${formatWikilink({ publisher: "p", type: "books", slug: "bk", section: "sec" })} here`;
    expect([...text.matchAll(wikilinkRe())]).toHaveLength(1);
  });
});
