// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEpub = vi.hoisted(() => vi.fn());
vi.mock("epub-gen-memory", () => ({ default: mockEpub }));

import { buildEpub } from "@/lib/epub";

describe("buildEpub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEpub.mockResolvedValue(Buffer.from("PK\x03\x04 fake epub"));
  });

  it("passes title and author to epub generator", async () => {
    await buildEpub({ title: "My Book", author: "Alice", sections: [] });
    expect(mockEpub).toHaveBeenCalledWith(
      expect.objectContaining({ title: "My Book", author: "Alice" }),
      []
    );
  });

  it("defaults author to Principia Synthesia", async () => {
    await buildEpub({ title: "Book", sections: [] });
    expect(mockEpub).toHaveBeenCalledWith(
      expect.objectContaining({ author: "Principia Synthesia" }),
      expect.anything()
    );
  });

  it("includes css in epub options", async () => {
    await buildEpub({ title: "Book", sections: [] });
    const [options] = mockEpub.mock.calls[0];
    expect(typeof options.css).toBe("string");
    expect(options.css.length).toBeGreaterThan(0);
  });

  it("renders inline math as SVG", async () => {
    await buildEpub({
      title: "Book",
      sections: [{ title: "Ch1", content: "Inline $E=mc^2$ math." }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toContain("<svg");
    expect(chapters[0].content).not.toContain("$E=mc^2");
  });

  it("renders display math as centered SVG block", async () => {
    await buildEpub({
      title: "Book",
      sections: [{ title: "Ch1", content: "Before.\n\n$$\na^2+b^2=c^2\n$$\n\nAfter." }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toContain("<svg");
    expect(chapters[0].content).toContain("text-align:center");
    expect(chapters[0].content).not.toContain("$$");
  });

  it("strips wikilinks to display text", async () => {
    await buildEpub({
      title: "Book",
      sections: [{ title: "Ch1", content: "See [[some-article]] and [[book:tensors|Tensors]]." }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).not.toContain("[[");
    expect(chapters[0].content).toContain("some-article");
    expect(chapters[0].content).toContain("Tensors");
  });

  it("strips JSX components", async () => {
    await buildEpub({
      title: "Book",
      sections: [{ title: "Ch1", content: '<DynamicAnimation slug="test" />' }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).not.toContain("DynamicAnimation");
  });

  it("handles null content without throwing", async () => {
    await buildEpub({
      title: "Book",
      sections: [{ title: "Ch1", content: null }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toContain('<main role="main"');
  });

  it("renders GFM tables", async () => {
    const mdx = "| A | B |\n|---|---|\n| 1 | 2 |";
    await buildEpub({ title: "Book", sections: [{ title: "Ch1", content: mdx }] });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toContain("<table");
  });

  it("wraps chapter body in main with role=main and aria-labelledby", async () => {
    await buildEpub({
      title: "Book",
      sections: [{ title: "Chapter One", content: "Hello world." }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toContain('<main role="main" aria-labelledby="section-title"');
  });

  it("includes a header with h1 carrying the chapter title", async () => {
    await buildEpub({
      title: "Book",
      sections: [{ title: "My Chapter", content: "Content." }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toContain("<header>");
    expect(chapters[0].content).toContain('<h1 id="section-title">My Chapter</h1>');
  });

  it("includes an empty footer element", async () => {
    await buildEpub({
      title: "Book",
      sections: [{ title: "Ch1", content: "Content." }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toContain("<footer>");
  });

  it("normalises skipped headings (h1 → h3 becomes h1 → h2)", async () => {
    await buildEpub({
      title: "Book",
      sections: [{ title: "Ch1", content: "# Top\n\n### Skipped" }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).not.toContain("<h3");
    expect(chapters[0].content).toContain("<h2");
  });

  it("does not alter already-sequential headings", async () => {
    await buildEpub({
      title: "Book",
      sections: [{ title: "Ch1", content: "# Top\n\n## Sub\n\n### SubSub" }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toContain("<h1");
    expect(chapters[0].content).toContain("<h2");
    expect(chapters[0].content).toContain("<h3");
  });

  it("wraps timeline chapter in landmarks when events are provided", async () => {
    const events = [{
      id: 1,
      slug: "event-a",
      title: "Event A",
      description: null,
      category: null,
      publisherSlug: null,
      isEraStart: false,
      isEraEnd: false,
      eraName: null,
      eventDate: new Date("2000-01-01"),
    }];
    await buildEpub({ title: "Book", sections: [], events });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters.length).toBe(1);
    expect(chapters[0].title).toBe("Timeline");
    expect(chapters[0].content).toContain('<main role="main"');
  });

  it("timeline chapter has exactly one h1 (from wrapChapterHtml, not renderTimelineHtml)", async () => {
    const events = [{
      id: 1,
      slug: "event-a",
      title: "Event A",
      description: null,
      category: null,
      publisherSlug: null,
      isEraStart: false,
      isEraEnd: false,
      eraName: null,
      eventDate: new Date("2000-01-01"),
    }];
    await buildEpub({ title: "Book", sections: [], events });
    const [, chapters] = mockEpub.mock.calls[0];
    const content: string = chapters[0].content;
    const h1Count = (content.match(/<h1[\s>]/g) ?? []).length;
    expect(h1Count).toBe(1);
  });
});
