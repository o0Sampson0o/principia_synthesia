import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { lintTags } from "@/lib/codemirror-tag-lint";

/** Build a fully-parsed markdown state and run the pure tag linter over it. */
function lint(doc: string) {
  const state = EditorState.create({ doc, extensions: [markdown()] });
  ensureSyntaxTree(state, doc.length, 5000);
  return lintTags(state);
}

describe("lintTags", () => {
  it("flags an unknown tag and suggests the closest element", () => {
    const d = lint("<detail>\n<summary>x</summary>\n</detail>");
    expect(d.length).toBeGreaterThan(0);
    expect(d.some((x) => /Unknown HTML element <detail>.*<details>/.test(x.message))).toBe(true);
  });

  it("does not flag valid elements", () => {
    const d = lint("<details>\n<summary>x</summary>\n</details>\n\n<br />");
    expect(d).toHaveLength(0);
  });

  it("ignores autolinks and inline math (not HTML tags)", () => {
    const d = lint("See <https://example.com> and $a < b$ inline.");
    expect(d).toHaveLength(0);
  });
});
