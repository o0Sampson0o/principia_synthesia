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
    await buildEpub({ title: "My Book", author: "Alice", chapters: [] });
    expect(mockEpub).toHaveBeenCalledWith(
      expect.objectContaining({ title: "My Book", author: "Alice" }),
      []
    );
  });

  it("defaults author to Principia Synthesia", async () => {
    await buildEpub({ title: "Book", chapters: [] });
    expect(mockEpub).toHaveBeenCalledWith(
      expect.objectContaining({ author: "Principia Synthesia" }),
      expect.anything()
    );
  });

  it("includes css in epub options", async () => {
    await buildEpub({ title: "Book", chapters: [] });
    const [options] = mockEpub.mock.calls[0];
    expect(typeof options.css).toBe("string");
    expect(options.css.length).toBeGreaterThan(0);
  });

  it("renders inline math as SVG", async () => {
    await buildEpub({
      title: "Book",
      chapters: [{ title: "Ch1", content: "Inline $E=mc^2$ math." }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toContain("<svg");
    expect(chapters[0].content).not.toContain("$E=mc^2");
  });

  it("renders display math as centered SVG block", async () => {
    await buildEpub({
      title: "Book",
      chapters: [{ title: "Ch1", content: "Before.\n\n$$\na^2+b^2=c^2\n$$\n\nAfter." }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toContain("<svg");
    expect(chapters[0].content).toContain("text-align:center");
    expect(chapters[0].content).not.toContain("$$");
  });

  it("strips wikilinks to display text", async () => {
    await buildEpub({
      title: "Book",
      chapters: [{ title: "Ch1", content: "See [[some-article]] and [[book:tensors|Tensors]]." }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).not.toContain("[[");
    expect(chapters[0].content).toContain("some-article");
    expect(chapters[0].content).toContain("Tensors");
  });

  it("strips JSX components", async () => {
    await buildEpub({
      title: "Book",
      chapters: [{ title: "Ch1", content: '<DynamicAnimation slug="test" />' }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).not.toContain("DynamicAnimation");
  });

  it("handles null content without throwing", async () => {
    await buildEpub({
      title: "Book",
      chapters: [{ title: "Ch1", content: null }],
    });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toBe("");
  });

  it("renders GFM tables", async () => {
    const mdx = "| A | B |\n|---|---|\n| 1 | 2 |";
    await buildEpub({ title: "Book", chapters: [{ title: "Ch1", content: mdx }] });
    const [, chapters] = mockEpub.mock.calls[0];
    expect(chapters[0].content).toContain("<table");
  });
});
