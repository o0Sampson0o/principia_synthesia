// @vitest-environment node
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { MarkdownMath } from "@/lib/codemirror-math";
import { MarkdownWikilink } from "@/lib/codemirror-wikilink";
import { buildInlineDecorations } from "@/lib/live-preview/decorate";

/** Editor state with the app's real markdown dialect, parse forced to completion. */
function stateOf(doc: string, anchor = 0): EditorState {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      markdown({ base: markdownLanguage, extensions: [...MarkdownMath, MarkdownWikilink] }),
    ],
  });
  ensureSyntaxTree(state, doc.length, 10_000);
  return state;
}

interface Spec {
  from: number;
  to: number;
  kind: string; // "hide" | `class:${string}` | `widget:${string}`
}

function build(state: EditorState): Spec[] {
  const built = buildInlineDecorations(state, [{ from: 0, to: state.doc.length }]);
  const items: Spec[] = [];
  built.decorations.between(0, state.doc.length, (from, to, deco) => {
    const spec = (deco as unknown as { spec: { widget?: object; class?: string } }).spec;
    const kind = spec.widget
      ? `widget:${spec.widget.constructor.name}`
      : spec.class
        ? `class:${spec.class}`
        : "hide";
    items.push({ from, to, kind });
  });
  return items;
}

describe("headings", () => {
  const doc = "# Hello\n\nbody text";

  it("hides the # mark and styles the line when the cursor is elsewhere", () => {
    const specs = build(stateOf(doc, doc.length)); // cursor in body
    expect(specs).toContainEqual({ from: 0, to: 0, kind: "class:cm-lp-h1" });
    expect(specs).toContainEqual({ from: 0, to: 2, kind: "hide" }); // "# "
  });

  it("keeps the mark visible (line class only) when the cursor is on the line", () => {
    const specs = build(stateOf(doc, 3)); // inside "Hello"
    expect(specs).toContainEqual({ from: 0, to: 0, kind: "class:cm-lp-h1" });
    expect(specs.filter((s) => s.kind === "hide")).toHaveLength(0);
  });

  it("styles h2–h6 with their own classes", () => {
    const d = "## Two\n\ntext";
    const specs = build(stateOf(d, d.length));
    expect(specs).toContainEqual({ from: 0, to: 0, kind: "class:cm-lp-h2" });
  });
});

describe("emphasis", () => {
  const doc = "some **bold** and *italic* text";

  it("hides both mark pairs when the cursor is outside", () => {
    const specs = build(stateOf(doc, 0));
    const hides = specs.filter((s) => s.kind === "hide");
    expect(hides).toContainEqual({ from: 5, to: 7, kind: "hide" }); // opening **
    expect(hides).toContainEqual({ from: 11, to: 13, kind: "hide" }); // closing **
    expect(specs).toContainEqual({ from: 5, to: 13, kind: "class:cm-lp-strong" });
    expect(specs).toContainEqual({ from: 18, to: 26, kind: "class:cm-lp-em" });
  });

  it("reveals marks when the cursor is inside the node", () => {
    const specs = build(stateOf(doc, 9)); // inside "bold"
    const hidesInBold = specs.filter((s) => s.kind === "hide" && s.from >= 5 && s.to <= 13);
    expect(hidesInBold).toHaveLength(0);
    // italic elsewhere still hidden
    expect(specs.filter((s) => s.kind === "hide" && s.from >= 18)).toHaveLength(2);
  });

  it("reveals at inclusive boundaries (cursor at node start)", () => {
    const specs = build(stateOf(doc, 5));
    expect(specs.filter((s) => s.kind === "hide" && s.from >= 5 && s.to <= 13)).toHaveLength(0);
  });
});

describe("inline code and links", () => {
  it("hides backticks and styles the code span", () => {
    const doc = "use `foo()` here";
    const specs = build(stateOf(doc, 0));
    expect(specs).toContainEqual({ from: 4, to: 11, kind: "class:cm-lp-code" });
    expect(specs.filter((s) => s.kind === "hide")).toHaveLength(2);
  });

  it("hides link syntax leaving the styled label", () => {
    const doc = "see [label](https://x.dev) now";
    const specs = build(stateOf(doc, 0));
    expect(specs).toContainEqual({ from: 4, to: 26, kind: "class:cm-lp-link" });
    // [, ], (url) — the URL node plus 4 marks collapse into hides
    expect(specs.filter((s) => s.kind === "hide").length).toBeGreaterThanOrEqual(3);
  });
});

describe("lists, quotes, rules", () => {
  it("replaces bullet marks with the em-dash widget when inactive", () => {
    const doc = "- alpha\n- beta\n\ncursor here";
    const specs = build(stateOf(doc, doc.length));
    expect(specs.filter((s) => s.kind === "widget:BulletWidget")).toHaveLength(2);
  });

  it("shows the raw bullet on the active line", () => {
    const doc = "- alpha\n- beta";
    const specs = build(stateOf(doc, 3)); // on first item
    expect(specs.filter((s) => s.kind === "widget:BulletWidget")).toHaveLength(1); // only second
  });

  it("leaves ordered-list marks visible", () => {
    const doc = "1. one\n2. two\n\nelsewhere";
    const specs = build(stateOf(doc, doc.length));
    expect(specs.filter((s) => s.kind.startsWith("widget:"))).toHaveLength(0);
  });

  it("styles quote lines and hides the > mark", () => {
    const doc = "> wisdom\n\nbody";
    const specs = build(stateOf(doc, doc.length));
    expect(specs).toContainEqual({ from: 0, to: 0, kind: "class:cm-lp-blockquote" });
    expect(specs).toContainEqual({ from: 0, to: 2, kind: "hide" }); // "> "
  });

  it("renders a horizontal rule widget when inactive", () => {
    const doc = "above\n\n***\n\nbelow";
    const specs = build(stateOf(doc, 0));
    expect(specs.filter((s) => s.kind === "widget:HrWidget")).toHaveLength(1);
  });
});

describe("untouched constructs (the must-not-break guarantee)", () => {
  it("fenced code gets zero decorations", () => {
    const doc = "```js\nconst x = **not bold**;\n```\n";
    expect(build(stateOf(doc, doc.length))).toHaveLength(0);
  });

  it("non-Cite JSX/HTML tags get zero decorations", () => {
    const doc = '<DynamicAnimation publisher="p" slug="anim-x" />\n\ntext';
    const specs = build(stateOf(doc, doc.length));
    expect(specs.filter((s) => s.from < 48)).toHaveLength(0);
  });

  it("tables get zero decorations", () => {
    const doc = "| a | b |\n| - | - |\n| 1 | 2 |\n";
    expect(build(stateOf(doc, doc.length))).toHaveLength(0);
  });

});

describe("rich widgets (phase 3)", () => {
  it("replaces inline math with a KaTeX widget when the cursor is outside", () => {
    const doc = "inline $x^2$ math";
    const specs = build(stateOf(doc, 0));
    expect(specs).toContainEqual({ from: 7, to: 12, kind: "widget:InlineMathWidget" });
  });

  it("reveals math source when the selection touches it (inclusive)", () => {
    const doc = "inline $x^2$ math";
    expect(
      build(stateOf(doc, 9)).filter((s) => s.kind === "widget:InlineMathWidget")
    ).toHaveLength(0);
    expect(
      build(stateOf(doc, 7)).filter((s) => s.kind === "widget:InlineMathWidget")
    ).toHaveLength(0); // at opening $
  });

  it("replaces wikilinks with chips (and reveals on selection)", () => {
    const doc = "see [[alice:articles:article-x|X]] here";
    const away = build(stateOf(doc, 0));
    expect(away).toContainEqual({ from: 4, to: 34, kind: "widget:WikilinkChipWidget" });
    const inside = build(stateOf(doc, 10));
    expect(inside.filter((s) => s.kind === "widget:WikilinkChipWidget")).toHaveLength(0);
  });

  it("leaves non-canonical [[...]] text untouched", () => {
    const doc = "not a link: [[plain note]] end";
    const specs = build(stateOf(doc, 0));
    expect(specs.filter((s) => s.kind.startsWith("widget:"))).toHaveLength(0);
  });

  it("replaces images with the image widget", () => {
    const doc = "before\n\n![diagram](/images/p/x.png)\n\nafter";
    const specs = build(stateOf(doc, 0));
    expect(specs).toContainEqual({ from: 8, to: 35, kind: "widget:ImageWidget" });
  });

  it("renders <Cite/> as numbered chips in first-appearance order", () => {
    const doc =
      'One <Cite slug="a/article-x" /> two <Cite slug="b/article-y" /> again <Cite slug="a/article-x" />.\n\nend';
    const state = stateOf(doc, doc.length);
    const built = buildInlineDecorations(state, [{ from: 0, to: doc.length }]);
    const chips: { number: number; slug: string }[] = [];
    built.decorations.between(0, doc.length, (_f, _t, deco) => {
      const w = (deco as unknown as { spec: { widget?: { slug: string; number: number } } }).spec
        .widget;
      if (w && "number" in w) chips.push({ number: w.number, slug: w.slug });
    });
    expect(chips.map((c) => c.number)).toEqual([1, 2, 1]); // repeat reuses its number
  });

  it("reveals cite source when the selection touches it", () => {
    const doc = 'text <Cite slug="a/article-x" /> end';
    const specs = build(stateOf(doc, 10)); // inside the tag
    expect(specs.filter((s) => s.kind === "widget:CiteChipWidget")).toHaveLength(0);
  });

  it("leaves the paired <Cite></Cite> form as source", () => {
    const doc = 'text <Cite slug="a/article-x"></Cite> end';
    const specs = build(stateOf(doc, 0));
    expect(specs.filter((s) => s.kind === "widget:CiteChipWidget")).toHaveLength(0);
  });

  it("wikilink and math widgets are atomic", () => {
    const doc = "a $x$ and [[p:articles:article-q]] b";
    const state = stateOf(doc, doc.length);
    const built = buildInlineDecorations(state, [{ from: 0, to: doc.length }]);
    let atomicCount = 0;
    built.atomics.between(0, doc.length, () => {
      atomicCount++;
    });
    expect(atomicCount).toBe(2);
  });
});

describe("frontmatter exclusion", () => {
  it("never decorates inside the leading YAML block", () => {
    const doc = '---\nstatus: published\ntags: ["a"]\n---\n\n# Title\n\nbody';
    const specs = build(stateOf(doc, doc.length));
    const fmEnd = 37; // end of closing ---
    expect(specs.filter((s) => s.from < fmEnd)).toHaveLength(0);
    // heading after frontmatter still works
    expect(specs.some((s) => s.kind === "class:cm-lp-h1")).toBe(true);
  });
});

describe("atomics and nodeRanges", () => {
  it("only widget replacements are atomic (marks stay walkable)", () => {
    const doc = "- item **bold**\n\n***\n\nend";
    const state = stateOf(doc, doc.length);
    const built = buildInlineDecorations(state, [{ from: 0, to: doc.length }]);
    let atomicCount = 0;
    built.atomics.between(0, doc.length, () => {
      atomicCount++;
    });
    expect(atomicCount).toBe(2); // bullet + hr, NOT the ** marks
  });

  it("reports selection-sensitive node ranges for the rebuild guard", () => {
    const doc = "# H\n\n**b**";
    const state = stateOf(doc, 0);
    const built = buildInlineDecorations(state, [{ from: 0, to: doc.length }]);
    expect(built.nodeRanges.length).toBeGreaterThanOrEqual(2);
  });
});
