// @vitest-environment node
import { describe, it, expect } from "vitest";
import { EditorState, EditorSelection, Text } from "@codemirror/state";
import {
  selectionIntersects,
  selectionTouchesLine,
  frontmatterExtent,
} from "@/lib/live-preview/reveal";

function sel(anchor: number, head?: number) {
  return EditorSelection.create([EditorSelection.range(anchor, head ?? anchor)]);
}

describe("selectionIntersects (inclusive boundaries)", () => {
  // node spans [5, 10]
  it.each([
    [4, false], // just before
    [5, true], // at start boundary
    [7, true], // inside
    [10, true], // at end boundary
    [11, false], // just after
  ])("cursor at %i → %s", (pos, expected) => {
    expect(selectionIntersects(sel(pos), 5, 10)).toBe(expected);
  });

  it("detects range selections overlapping either side", () => {
    expect(selectionIntersects(sel(0, 5), 5, 10)).toBe(true); // ends at start
    expect(selectionIntersects(sel(10, 20), 5, 10)).toBe(true); // starts at end
    expect(selectionIntersects(sel(0, 4), 5, 10)).toBe(false);
    expect(selectionIntersects(sel(11, 20), 5, 10)).toBe(false);
    expect(selectionIntersects(sel(0, 20), 5, 10)).toBe(true); // engulfs
  });

  it("checks every range of a multi-cursor selection", () => {
    const multi = EditorSelection.create([
      EditorSelection.range(0, 0),
      EditorSelection.range(7, 7),
    ]);
    expect(selectionIntersects(multi, 5, 10)).toBe(true);
  });
});

describe("selectionTouchesLine", () => {
  const state = EditorState.create({
    doc: "# Heading\nplain paragraph\n> quote",
    selection: { anchor: 3 }, // inside the heading line
  });

  it("true when the selection is anywhere on the node's line", () => {
    expect(selectionTouchesLine(state, 0, 9)).toBe(true);
    expect(selectionTouchesLine(state, 2, 2)).toBe(true);
  });

  it("false for other lines", () => {
    expect(selectionTouchesLine(state, 10, 25)).toBe(false);
  });
});

describe("frontmatterExtent", () => {
  it("returns the closing delimiter's end", () => {
    const doc = Text.of(["---", "status: draft", "---", "", "# Body"]);
    // "---\n" (4) + "status: draft\n" (14) + "---" → 4 + 14 + 3 = 21
    expect(frontmatterExtent(doc)).toBe(21);
  });

  it("returns 0 without frontmatter", () => {
    expect(frontmatterExtent(Text.of(["# Just a doc", "body"]))).toBe(0);
  });

  it("returns 0 for an unclosed block", () => {
    expect(frontmatterExtent(Text.of(["---", "status: draft", "body"]))).toBe(0);
  });

  it("returns 0 when --- is not the very first line", () => {
    expect(frontmatterExtent(Text.of(["", "---", "x: 1", "---"]))).toBe(0);
  });

  it("returns 0 for a single-line doc", () => {
    expect(frontmatterExtent(Text.of(["---"]))).toBe(0);
  });
});
