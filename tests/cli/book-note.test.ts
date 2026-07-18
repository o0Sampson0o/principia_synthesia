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
  sections: [
    { position: 0, partTitle: "Mechanics", chapterTitle: null, articleId: 1, articleSlug: "article-newton", title: "Newton", isInternal: false },
    { position: 1, partTitle: "Mechanics", chapterTitle: null, articleId: 2, articleSlug: "article-lagrange", title: "Lagrange", isInternal: false },
    { position: 2, partTitle: "Fields", chapterTitle: null, articleId: 3, articleSlug: "article-maxwell", title: "Maxwell", isInternal: false },
  ],
};

describe("renderBookNote / parseBookNote round-trip", () => {
  it("markdown links round-trip to the same structure", () => {
    const rendered = renderBookNote(BOOK, "markdown", "md");
    const parsed = parseBookNote(rendered);
    expect(parsed.sections).toEqual([
      { articleSlug: "article-newton", partTitle: "Mechanics", chapterTitle: null },
      { articleSlug: "article-lagrange", partTitle: "Mechanics", chapterTitle: null },
      { articleSlug: "article-maxwell", partTitle: "Fields", chapterTitle: null },
    ]);
  });

  it("wikilinks round-trip too", () => {
    const rendered = renderBookNote(BOOK, "wikilink", "md");
    expect(parseBookNote(rendered).sections.map((c) => c.articleSlug)).toEqual([
      "article-newton",
      "article-lagrange",
      "article-maxwell",
    ]);
  });

  it("round-trips a null part that follows a named part (no silent inherit)", () => {
    const book = {
      ...BOOK,
      sections: [
        { position: 0, partTitle: "Foundations", chapterTitle: null, articleId: 1, articleSlug: "article-a", title: "A", isInternal: false },
        { position: 1, partTitle: null, chapterTitle: null, articleId: 2, articleSlug: "article-b", title: "B", isInternal: false },
      ],
    };
    const rendered = renderBookNote(book, "markdown", "md");
    const parsed = parseBookNote(rendered);
    expect(parsed.sections).toEqual([
      { articleSlug: "article-a", partTitle: "Foundations", chapterTitle: null },
      { articleSlug: "article-b", partTitle: null, chapterTitle: null }, // NOT "Foundations"
    ]);
  });

  it("round-trips two-level Part › Chapter groupings", () => {
    const book = {
      ...BOOK,
      sections: [
        { position: 0, partTitle: "Part I", chapterTitle: "Chapter 1", articleId: 1, articleSlug: "article-a", title: "A", isInternal: false },
        { position: 1, partTitle: null, chapterTitle: null, articleId: 2, articleSlug: "article-b", title: "B", isInternal: false },
        { position: 2, partTitle: "Part II", chapterTitle: "Chapter 2", articleId: 3, articleSlug: "article-c", title: "C", isInternal: false },
      ],
    };
    const rendered = renderBookNote(book, "markdown", "md");
    // The chapter divider is rendered as a `### ` heading below its part.
    expect(rendered).toContain("## Part I");
    expect(rendered).toContain("### Chapter 1");
    const parsed = parseBookNote(rendered);
    expect(parsed.sections).toEqual([
      { articleSlug: "article-a", partTitle: "Part I", chapterTitle: "Chapter 1" },
      { articleSlug: "article-b", partTitle: null, chapterTitle: null },
      { articleSlug: "article-c", partTitle: "Part II", chapterTitle: "Chapter 2" },
    ]);
  });

  it("a pulled file hashes to the same value the server would report", () => {
    const rendered = renderBookNote(BOOK, "markdown", "md");
    const local = structureLocalHash(parseBookNote(rendered).sections);
    const server = structureLocalHash(
      BOOK.sections.map((c) => ({ articleSlug: c.articleSlug, partTitle: c.partTitle, chapterTitle: c.chapterTitle }))
    );
    expect(local).toBe(server);
  });

  it("hash parity holds with chapter groupings too", () => {
    const book = {
      ...BOOK,
      sections: [
        { position: 0, partTitle: "Part I", chapterTitle: "Chapter 1", articleId: 1, articleSlug: "article-a", title: "A", isInternal: false },
        { position: 1, partTitle: null, chapterTitle: null, articleId: 2, articleSlug: "article-b", title: "B", isInternal: false },
      ],
    };
    const rendered = renderBookNote(book, "markdown", "md");
    const local = structureLocalHash(parseBookNote(rendered).sections);
    const server = structureLocalHash(
      book.sections.map((c) => ({ articleSlug: c.articleSlug, partTitle: c.partTitle, chapterTitle: c.chapterTitle }))
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
    expect(parseBookNote(edited).sections.map((c) => c.articleSlug)).toEqual([
      "article-lagrange",
      "article-newton",
      "article-maxwell",
    ]);
  });

  it("reflects moving a section to a different part", () => {
    const edited = `# Physics

## Mechanics
1. [Newton](../articles/article-newton.md)

## Fields
2. [Lagrange](../articles/article-lagrange.md)
3. [Maxwell](../articles/article-maxwell.md)
`;
    const parsed = parseBookNote(edited);
    expect(parsed.sections.find((c) => c.articleSlug === "article-lagrange")?.partTitle).toBe(
      "Fields"
    );
  });

  it("tracks a section's chapter under its part", () => {
    const edited = `# Physics

## Mechanics
### Kinematics
1. [Newton](../articles/article-newton.md)
`;
    const parsed = parseBookNote(edited);
    expect(parsed.sections).toEqual([
      { articleSlug: "article-newton", partTitle: "Mechanics", chapterTitle: "Kinematics" },
    ]);
  });

  it("ignores prose, comments, and the title line", () => {
    const note = `# Physics

<!-- reorder here -->
Some stray prose with a [random link](https://example.com).

## Mechanics
1. [Newton](../articles/article-newton.md)
`;
    expect(parseBookNote(note).sections).toEqual([
      { articleSlug: "article-newton", partTitle: "Mechanics", chapterTitle: null },
    ]);
  });
});
