// @vitest-environment node
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { MarkdownMath } from "@/lib/codemirror-math";
import { mathAtCursor } from "@/lib/live-preview/math-tooltip";

function stateOf(doc: string, anchor: number): EditorState {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage, extensions: MarkdownMath })],
  });
  ensureSyntaxTree(state, doc.length, 10_000);
  return state;
}

describe("mathAtCursor", () => {
  const doc = "text $a+b$ more\n\n$$\n\\int x\n$$\n\nend";

  it("finds inline math when the cursor is inside it", () => {
    const m = mathAtCursor(stateOf(doc, 7)); // inside a+b
    expect(m).toMatchObject({ formula: "a+b", displayMode: false, from: 5 });
  });

  it("counts the delimiters as inside (boundary bias)", () => {
    expect(mathAtCursor(stateOf(doc, 5))?.formula).toBe("a+b"); // at opening $
    expect(mathAtCursor(stateOf(doc, 10))?.formula).toBe("a+b"); // at closing $
  });

  it("finds block math with the $$ fences stripped", () => {
    const m = mathAtCursor(stateOf(doc, 22)); // inside \int x
    expect(m).toMatchObject({ formula: "\\int x", displayMode: true });
  });

  it("returns null in plain prose", () => {
    expect(mathAtCursor(stateOf(doc, 1))).toBeNull();
    expect(mathAtCursor(stateOf(doc, doc.length))).toBeNull();
  });

  it("returns null for an empty formula", () => {
    const d = "x $$$$ y"; // degenerate
    expect(mathAtCursor(stateOf(d, 4))).toBeNull();
  });
});
