import { describe, it, expect } from "vitest";
import { extractToc } from "@/lib/article-toc";

describe("extractToc", () => {
  it("extracts h1–h3 with depths and slugged ids", () => {
    const toc = extractToc("# Intro\n\ntext\n\n## Set Theory\n\n### ZFC Axioms\n");
    expect(toc).toEqual([
      { depth: 1, text: "Intro", id: "intro" },
      { depth: 2, text: "Set Theory", id: "set-theory" },
      { depth: 3, text: "ZFC Axioms", id: "zfc-axioms" },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const toc = extractToc("# Real\n\n```md\n# Not a heading\n```\n\n## Also real\n");
    expect(toc.map((t) => t.text)).toEqual(["Real", "Also real"]);
  });

  it("deduplicates repeated heading slugs like github-slugger", () => {
    const toc = extractToc("# Proof\n\n# Proof\n");
    expect(toc.map((t) => t.id)).toEqual(["proof", "proof-1"]);
  });

  it("strips inline markdown and wikilinks from TOC text", () => {
    const toc = extractToc("## The **Big** `Idea` of [[energy|Energy]]\n");
    expect(toc[0].text).toBe("The Big Idea of Energy");
  });

  it("extracts headings from a CRLF body (Windows-synced markdown)", () => {
    const toc = extractToc("# Hamiltonian\r\n## Atom\r\n\r\ntext\r\n\r\n## Bath\r\n");
    expect(toc).toEqual([
      { depth: 1, text: "Hamiltonian", id: "hamiltonian" },
      { depth: 2, text: "Atom", id: "atom" },
      { depth: 2, text: "Bath", id: "bath" },
    ]);
  });

  it("still skips fenced code blocks with CRLF line endings", () => {
    const toc = extractToc("# Real\r\n\r\n```md\r\n# Not a heading\r\n```\r\n\r\n## Also real\r\n");
    expect(toc.map((t) => t.text)).toEqual(["Real", "Also real"]);
  });

  it("skips h4+ and non-headings", () => {
    const toc = extractToc("#### Too deep\n\nplain # not heading\n");
    expect(toc).toEqual([]);
  });
});
