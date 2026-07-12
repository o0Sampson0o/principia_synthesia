// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseWikilink, wikilinkRe } from "@/lib/wikilink-syntax";

describe("parseWikilink", () => {
  it("parses the three-segment form", () => {
    expect(parseWikilink("[[alice:articles:article-x]]")).toEqual({
      publisher: "alice",
      type: "articles",
      slug: "article-x",
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

describe("wikilinkRe (scanning form)", () => {
  it("finds all links in prose, matching remarkWikilinks behavior", () => {
    const text = "see [[a:articles:article-x]] and [[b:objects:object-y|Y]] end";
    const matches = [...text.matchAll(wikilinkRe())];
    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe("a");
    expect(matches[1][4]).toBe("Y");
  });

  it("returns a fresh regex each call (no lastIndex leakage)", () => {
    const a = wikilinkRe();
    a.exec("x [[p:articles:article-a]]");
    expect(wikilinkRe().lastIndex).toBe(0);
  });
});
