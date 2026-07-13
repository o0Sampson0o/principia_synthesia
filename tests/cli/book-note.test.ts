// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseBookNote,
  renderBookNote,
  structureLocalHash,
} from "../../cli/ps-sync/src/book-note";

const BOOK = {
  slug: "book-physics",
  title: "Physics",
  summary: null,
  structureHash: "x",
  chapters: [
    { position: 0, partTitle: "Mechanics", articleId: 1, articleSlug: "article-newton", title: "Newton", isInternal: false },
    { position: 1, partTitle: "Mechanics", articleId: 2, articleSlug: "article-lagrange", title: "Lagrange", isInternal: false },
    { position: 2, partTitle: "Fields", articleId: 3, articleSlug: "article-maxwell", title: "Maxwell", isInternal: false },
  ],
};

describe("renderBookNote / parseBookNote round-trip", () => {
  it("markdown links round-trip to the same structure", () => {
    const rendered = renderBookNote(BOOK, "markdown", "md");
    const parsed = parseBookNote(rendered);
    expect(parsed.chapters).toEqual([
      { articleSlug: "article-newton", partTitle: "Mechanics" },
      { articleSlug: "article-lagrange", partTitle: "Mechanics" },
      { articleSlug: "article-maxwell", partTitle: "Fields" },
    ]);
  });

  it("wikilinks round-trip too", () => {
    const rendered = renderBookNote(BOOK, "wikilink", "md");
    expect(parseBookNote(rendered).chapters.map((c) => c.articleSlug)).toEqual([
      "article-newton",
      "article-lagrange",
      "article-maxwell",
    ]);
  });

  it("round-trips a null part that follows a named part (no silent inherit)", () => {
    const book = {
      ...BOOK,
      chapters: [
        { position: 0, partTitle: "Foundations", articleId: 1, articleSlug: "article-a", title: "A", isInternal: false },
        { position: 1, partTitle: null, articleId: 2, articleSlug: "article-b", title: "B", isInternal: false },
      ],
    };
    const rendered = renderBookNote(book, "markdown", "md");
    const parsed = parseBookNote(rendered);
    expect(parsed.chapters).toEqual([
      { articleSlug: "article-a", partTitle: "Foundations" },
      { articleSlug: "article-b", partTitle: null }, // NOT "Foundations"
    ]);
  });

  it("a pulled file hashes to the same value the server would report", () => {
    const rendered = renderBookNote(BOOK, "markdown", "md");
    const local = structureLocalHash(parseBookNote(rendered).chapters);
    const server = structureLocalHash(
      BOOK.chapters.map((c) => ({ articleSlug: c.articleSlug, partTitle: c.partTitle }))
    );
    expect(local).toBe(server);
  });
});

describe("parseBookNote detects user edits", () => {
  it("reflects a manual reorder", () => {
    const edited = `# Physics

## Mechanics
1. [Lagrange](../articles/article-lagrange.md)
2. [Newton](../articles/article-newton.md)

## Fields
3. [Maxwell](../articles/article-maxwell.md)
`;
    expect(parseBookNote(edited).chapters.map((c) => c.articleSlug)).toEqual([
      "article-lagrange",
      "article-newton",
      "article-maxwell",
    ]);
  });

  it("reflects moving a chapter to a different part", () => {
    const edited = `# Physics

## Mechanics
1. [Newton](../articles/article-newton.md)

## Fields
2. [Lagrange](../articles/article-lagrange.md)
3. [Maxwell](../articles/article-maxwell.md)
`;
    const parsed = parseBookNote(edited);
    expect(parsed.chapters.find((c) => c.articleSlug === "article-lagrange")?.partTitle).toBe(
      "Fields"
    );
  });

  it("ignores prose, comments, and the title line", () => {
    const note = `# Physics

<!-- reorder here -->
Some stray prose with a [random link](https://example.com).

## Mechanics
1. [Newton](../articles/article-newton.md)
`;
    expect(parseBookNote(note).chapters).toEqual([
      { articleSlug: "article-newton", partTitle: "Mechanics" },
    ]);
  });
});
