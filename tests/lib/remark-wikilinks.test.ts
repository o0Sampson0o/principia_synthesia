import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import type { Root, Link, Text, Paragraph } from "mdast";

/** Parse markdown, run the wikilinks transform, and return the AST root. */
function process(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkWikilinks);
  const tree = processor.parse(markdown) as Root;
  processor.runSync(tree);
  return tree;
}

function processToString(markdown: string): string {
  return unified()
    .use(remarkParse)
    .use(remarkWikilinks)
    .use(remarkStringify)
    .processSync(markdown)
    .toString();
}

function getFirstParagraphChildren(markdown: string) {
  const tree = process(markdown);
  const para = tree.children[0] as Paragraph;
  return para.children;
}

describe("remarkWikilinks", () => {
  it("transforms [[slug]] to a link with href /slug and display text 'slug'", () => {
    const children = getFirstParagraphChildren("[[my-article]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.type).toBe("link");
    expect(link.url).toBe("/my-article");
    expect((link.children[0] as Text).value).toBe("my-article");
  });

  it("transforms [[slug|Display Text]] with custom label and href /slug", () => {
    const children = getFirstParagraphChildren("[[my-article|Display Text]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.type).toBe("link");
    expect(link.url).toBe("/my-article");
    expect((link.children[0] as Text).value).toBe("Display Text");
  });

  it("transforms [[book:my-book]] to href /curriculum/my-book with display text 'my-book'", () => {
    const children = getFirstParagraphChildren("[[book:my-book]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.type).toBe("link");
    expect(link.url).toBe("/curriculum/my-book");
    expect((link.children[0] as Text).value).toBe("my-book");
  });

  it("transforms [[book:my-book|My Book]] with display text 'My Book' and href /curriculum/my-book", () => {
    const children = getFirstParagraphChildren("[[book:my-book|My Book]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.type).toBe("link");
    expect(link.url).toBe("/curriculum/my-book");
    expect((link.children[0] as Text).value).toBe("My Book");
  });

  it("transforms [[anim:orbit-sim]] to href /animations/orbit-sim", () => {
    const children = getFirstParagraphChildren("[[anim:orbit-sim]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.type).toBe("link");
    expect(link.url).toBe("/animations/orbit-sim");
    expect((link.children[0] as Text).value).toBe("orbit-sim");
  });

  it("transforms [[anim:orbit-sim|Orbit Simulation]] with custom label", () => {
    const children = getFirstParagraphChildren("[[anim:orbit-sim|Orbit Simulation]]");
    expect(children).toHaveLength(1);
    const link = children[0] as Link;
    expect(link.url).toBe("/animations/orbit-sim");
    expect((link.children[0] as Text).value).toBe("Orbit Simulation");
  });

  it("leaves text with no wikilinks unchanged", () => {
    const children = getFirstParagraphChildren("No wikilinks here, just regular text.");
    expect(children).toHaveLength(1);
    const text = children[0] as Text;
    expect(text.type).toBe("text");
    expect(text.value).toBe("No wikilinks here, just regular text.");
  });

  it("transforms multiple wikilinks on the same line", () => {
    const children = getFirstParagraphChildren("Read [[article-one]] and [[book:calc|Calculus]] for more.");
    // Should be: text "Read ", link, text " and ", link, text " for more."
    expect(children.length).toBeGreaterThanOrEqual(4);

    const link1 = children.find(
      (c) => c.type === "link" && (c as Link).url === "/article-one"
    ) as Link | undefined;
    const link2 = children.find(
      (c) => c.type === "link" && (c as Link).url === "/curriculum/calc"
    ) as Link | undefined;

    expect(link1).toBeDefined();
    expect((link1!.children[0] as Text).value).toBe("article-one");
    expect(link2).toBeDefined();
    expect((link2!.children[0] as Text).value).toBe("Calculus");
  });

  it("preserves surrounding text around a wikilink", () => {
    const children = getFirstParagraphChildren("Before [[slug]] after");
    expect(children).toHaveLength(3);
    expect((children[0] as Text).value).toBe("Before ");
    expect((children[1] as Link).url).toBe("/slug");
    expect((children[2] as Text).value).toBe(" after");
  });

  it("handles multiple consecutive wikilinks without text between them", () => {
    const children = getFirstParagraphChildren("[[a]][[b]]");
    const links = children.filter((c) => c.type === "link") as Link[];
    expect(links).toHaveLength(2);
    expect(links[0].url).toBe("/a");
    expect(links[1].url).toBe("/b");
  });
});
