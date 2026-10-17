import { describe, it, expect } from "vitest";
import { blockAt, moveBlock, duplicateBlock, deleteBlock } from "@/lib/live-preview/blocks";

const doc = [
  "# Title",          // 0
  "",                 // 1
  "First para line",  // 2
  "continues here.",  // 3
  "",                 // 4
  "- item one",       // 5
  "  more of one",    // 6
  "- item two",       // 7
  "",                 // 8
  "$$",               // 9
  "E = mc^2",         // 10
  "$$",               // 11
  "",                 // 12
  "> [!note] Hi",     // 13
  "> body",           // 14
  "",                 // 15
  "| a | b |",        // 16
  "| - | - |",        // 17
  "",                 // 18
  "Last.",            // 19
];

describe("blockAt", () => {
  it("finds each kind of block", () => {
    expect(blockAt(doc, 0)).toEqual({ from: 0, to: 0 });
    expect(blockAt(doc, 3)).toEqual({ from: 2, to: 3 });
    expect(blockAt(doc, 6)).toEqual({ from: 5, to: 6 });
    expect(blockAt(doc, 7)).toEqual({ from: 7, to: 7 });
    expect(blockAt(doc, 10)).toEqual({ from: 9, to: 11 });
    expect(blockAt(doc, 14)).toEqual({ from: 13, to: 14 });
    expect(blockAt(doc, 17)).toEqual({ from: 16, to: 17 });
    expect(blockAt(doc, 1)).toBeNull();
  });

  it("keeps a fenced code block whole even with blank lines inside", () => {
    const d = ["```js", "a()", "", "b()", "```"];
    expect(blockAt(d, 2)).toEqual({ from: 0, to: 4 });
  });

  it("treats <details> … </details> as one block", () => {
    const d = ["<details>", "<summary>S</summary>", "", "inner", "</details>"];
    expect(blockAt(d, 3)).toEqual({ from: 0, to: 4 });
  });
});

describe("moveBlock", () => {
  it("moves a paragraph to the end, keeping blank-line separation", () => {
    const r = moveBlock(doc, { from: 2, to: 3 }, doc.length)!;
    expect(r.lines.slice(-3)).toEqual(["", "First para line", "continues here."]);
    expect(r.lines[2]).toBe("- item one");
    expect(r.lines[r.at]).toBe("First para line");
  });

  it("moves a block up above the title", () => {
    const r = moveBlock(doc, { from: 19, to: 19 }, 0)!;
    expect(r.lines.slice(0, 3)).toEqual(["Last.", "", "# Title"]);
    expect(r.lines[r.lines.length - 1]).toBe("| - | - |");
  });

  it("returns null for a no-op target inside or right after the block", () => {
    expect(moveBlock(doc, { from: 2, to: 3 }, 3)).toBeNull();
    expect(moveBlock(doc, { from: 2, to: 3 }, 4)).toBeNull();
  });

  it("keeps the line count stable apart from separators", () => {
    const r = moveBlock(doc, { from: 9, to: 11 }, 0)!;
    expect(r.lines.filter((l) => l.trim()).length).toBe(doc.filter((l) => l.trim()).length);
  });
});

describe("duplicateBlock / deleteBlock", () => {
  it("duplicates after itself", () => {
    const r = duplicateBlock(doc, { from: 0, to: 0 });
    expect(r.lines.slice(0, 3)).toEqual(["# Title", "", "# Title"]);
    expect(r.at).toBe(2);
  });
  it("deletes with one separating blank line", () => {
    const out = deleteBlock(doc, { from: 2, to: 3 });
    expect(out.slice(0, 3)).toEqual(["# Title", "", "- item one"]);
  });
});
