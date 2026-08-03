import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import type { Root, Link, Text, Paragraph } from "mdast";

/** Parse markdown, run the wikilinks transform, and return the AST root. */
function process(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkWikilinks);
  const tree = processor.parse(markdown) as Root;
  processor.runSync(tree);
  return tree;
}

function getFirstParagraphChildren(markdown: string) {
  const tree = process(markdown);
  const para = tree.children[0] as Paragraph;
  return para.children;
}

describe("remarkWikilinks", () => {
  it("transforms [[publisher:articles:slug]] to /<publisher>/articles/<slug>", () => {
    const children = getFirstParagraphChildren("[[alice:articles:article-intro]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.type).toBe("link");
    expect(link.url).toBe("/alice/articles/article-intro");
    expect((link.children[0] as Text).value).toBe("article-intro");
  });

  it("transforms [[publisher:articles:slug|Display Text]] with custom label", () => {
    const children = getFirstParagraphChildren("[[alice:articles:article-intro|My Article]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.type).toBe("link");
    expect(link.url).toBe("/alice/articles/article-intro");
    expect((link.children[0] as Text).value).toBe("My Article");
  });

  it("transforms [[publisher:books:slug]] to /<publisher>/books/<slug>", () => {
    const children = getFirstParagraphChildren("[[alice:books:book-calc]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.type).toBe("link");
    expect(link.url).toBe("/alice/books/book-calc");
    expect((link.children[0] as Text).value).toBe("book-calc");
  });

  it("transforms [[publisher:books:slug|Label]] with custom label", () => {
    const children = getFirstParagraphChildren("[[alice:books:book-calc|Calculus]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.type).toBe("link");
    expect(link.url).toBe("/alice/books/book-calc");
    expect((link.children[0] as Text).value).toBe("Calculus");
  });

  it("transforms [[publisher:objects:slug]] to /<publisher>/objects/<slug>", () => {
    const children = getFirstParagraphChildren("[[alice:objects:anim-pendulum]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.type).toBe("link");
    expect(link.url).toBe("/alice/objects/anim-pendulum");
    expect((link.children[0] as Text).value).toBe("anim-pendulum");
  });

  it("transforms [[publisher:objects:slug|Label]] with custom label", () => {
    const children = getFirstParagraphChildren("[[alice:objects:anim-pendulum|Pendulum Sim]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.url).toBe("/alice/objects/anim-pendulum");
    expect((link.children[0] as Text).value).toBe("Pendulum Sim");
  });

  it("leaves text with no wikilinks unchanged", () => {
    const children = getFirstParagraphChildren("No wikilinks here, just regular text.");
    expect(children).toHaveLength(1);
    const text = children[0] as Text;
    expect(text.type).toBe("text");
    expect(text.value).toBe("No wikilinks here, just regular text.");
  });

  it("leaves old-style [[slug]] syntax unchanged (not matched)", () => {
    const children = getFirstParagraphChildren("[[my-article]]");
    // The new plugin requires [[publisher:type:slug]], so this is left as-is
    expect(children).toHaveLength(1);
    const node = children[0] as Text;
    expect(node.type).toBe("text");
  });

  it("transforms multiple wikilinks on the same line", () => {
    const children = getFirstParagraphChildren(
      "Read [[alice:articles:article-one]] and [[alice:books:book-calc|Calculus]] for more."
    );
    // Should be: text "Read ", link, text " and ", link, text " for more."
    expect(children.length).toBeGreaterThanOrEqual(4);

    const link1 = children.find(
      (c) => c.type === "link" && (c as Link).url === "/alice/articles/article-one"
    ) as Link | undefined;
    const link2 = children.find(
      (c) => c.type === "link" && (c as Link).url === "/alice/books/book-calc"
    ) as Link | undefined;

    expect(link1).toBeDefined();
    expect((link1!.children[0] as Text).value).toBe("article-one");
    expect(link2).toBeDefined();
    expect((link2!.children[0] as Text).value).toBe("Calculus");
  });

  it("preserves surrounding text around a wikilink", () => {
    const children = getFirstParagraphChildren("Before [[alice:articles:article-hello]] after");
    expect(children).toHaveLength(3);
    expect((children[0] as Text).value).toBe("Before ");
    expect((children[1] as Link).url).toBe("/alice/articles/article-hello");
    expect((children[2] as Text).value).toBe(" after");
  });

  it("handles multiple consecutive wikilinks without text between them", () => {
    const children = getFirstParagraphChildren(
      "[[alice:articles:article-a]][[bob:articles:article-b]]"
    );
    const links = children.filter((c) => c.type === "link") as Link[];
    expect(links).toHaveLength(2);
    expect(links[0].url).toBe("/alice/articles/article-a");
    expect(links[1].url).toBe("/bob/articles/article-b");
  });

  it("ignores wikilinks with invalid type segments", () => {
    // 'curriculum' and 'anim' are not valid types in the new format
    const children = getFirstParagraphChildren("[[alice:curriculum:book-calc]]");
    expect(children).toHaveLength(1);
    expect((children[0] as Text).type).toBe("text");
  });
});

describe("remarkWikilinks — book section form", () => {
  it("links [[pub:books:book:section]] to the book section URL", () => {
    const children = getFirstParagraphChildren("[[alice:books:relativity:intro]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.url).toBe("/alice/books/relativity/intro");
    expect((link.children[0] as Text).value).toBe("intro");
  });

  it("keeps two books' same-named sections pointing at different URLs", () => {
    const a = getFirstParagraphChildren("[[p:books:relativity:intro]]")[0] as Link;
    const b = getFirstParagraphChildren("[[p:books:mechanics:intro]]")[0] as Link;
    expect(a.url).toBe("/p/books/relativity/intro");
    expect(b.url).toBe("/p/books/mechanics/intro");
  });

  it("leaves a section on a non-book type as literal text", () => {
    const children = getFirstParagraphChildren("see [[p:articles:a:b]] here");
    // No link node at all — the whole paragraph stays text.
    expect(children.every((c) => c.type === "text")).toBe(true);
    const joined = children.map((c) => (c as Text).value).join("");
    expect(joined).toBe("see [[p:articles:a:b]] here");
  });

  it("still transforms valid links in a paragraph containing an invalid one", () => {
    const children = getFirstParagraphChildren(
      "bad [[p:articles:a:b]] good [[p:books:bk:sec]]"
    );
    const links = children.filter((c) => c.type === "link") as Link[];
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("/p/books/bk/sec");
    // The invalid one survives verbatim in the surrounding text.
    const joined = children.map((c) => (c.type === "text" ? (c as Text).value : "")).join("");
    expect(joined).toContain("[[p:articles:a:b]]");
  });
});
