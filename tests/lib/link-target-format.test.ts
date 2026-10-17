import { describe, it, expect } from "vitest";
import { linkTargetToWikilink, matchWikilinkQuery } from "@/lib/link-target-format";
import { parseWikilink } from "@/lib/wikilink-syntax";

describe("matchWikilinkQuery", () => {
  it("opens on [[ and tracks the typed title", () => {
    expect(matchWikilinkQuery("see [[")).toEqual({ query: "", start: 4 });
    expect(matchWikilinkQuery("see [[Galilean rel")).toEqual({ query: "Galilean rel", start: 4 });
  });
  it("leaves hand-written link syntax alone", () => {
    expect(matchWikilinkQuery("[[alice:articles:x")).toBeNull();
    expect(matchWikilinkQuery("[[alice:articles:x|Label")).toBeNull();
  });
  it("does not fire after a closed link or a single bracket", () => {
    expect(matchWikilinkQuery("[[a:articles:x]] and")).toBeNull();
    expect(matchWikilinkQuery("array[i")).toBeNull();
  });
});

describe("linkTargetToWikilink", () => {
  it("writes an article link labelled with its title", () => {
    const link = linkTargetToWikilink({ kind: "article", title: "Special Relativity", publisherSlug: "alice", slug: "article-special-relativity" });
    expect(link).toBe("[[alice:articles:article-special-relativity|Special Relativity]]");
  });

  it("book-qualifies a section and round-trips through the parser", () => {
    const link = linkTargetToWikilink({
      kind: "section",
      title: "Galilean Relativity",
      publisherSlug: "alice",
      slug: "article-galilean-relativity",
      bookSlug: "book-classical-physics",
      bookTitle: "Classical Physics",
    });
    expect(link).toBe("[[alice:books:book-classical-physics:article-galilean-relativity|Galilean Relativity]]");
    expect(parseWikilink(link)).toMatchObject({
      publisher: "alice",
      type: "books",
      slug: "book-classical-physics",
      section: "article-galilean-relativity",
      label: "Galilean Relativity",
    });
  });

  it("strips characters that would break the link from the label", () => {
    const link = linkTargetToWikilink({ kind: "book", title: "Sets [draft]\nnotes", publisherSlug: "alice", slug: "book-sets" });
    expect(link).toBe("[[alice:books:book-sets|Sets [draft notes]]");
  });
});
