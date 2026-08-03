// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseWikilink, wikilinkRe } from "@/lib/wikilink-syntax";

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
