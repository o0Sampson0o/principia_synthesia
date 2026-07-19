import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { MarkdownMath } from "@/lib/codemirror-math";
import { renderCalloutBody, CalloutWidget } from "@/lib/live-preview/widgets/callout";
import { findCallouts } from "@/lib/live-preview/callout";

/** Parse a fragment of body HTML into an element for structural assertions. */
function parse(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("renderCalloutBody", () => {
  it("renders a paragraph with inline math", () => {
    const el = parse(renderCalloutBody("Energy is $E = mc^2$ here."));
    const p = el.querySelector("p");
    expect(p).not.toBeNull();
    expect(p!.textContent).toContain("Energy is");
    // Inline math wrapped and rendered by KaTeX.
    const math = el.querySelector("span.cm-lp-math");
    expect(math).not.toBeNull();
    expect(math!.querySelector(".katex")).not.toBeNull();
  });

  it("renders a $$…$$ block as a .cm-lp-math-block", () => {
    const el = parse(renderCalloutBody("$$\nx^2 + y^2 = z^2\n$$"));
    const block = el.querySelector("div.cm-lp-math-block");
    expect(block).not.toBeNull();
    expect(block!.querySelector(".katex")).not.toBeNull();
    // No stray paragraph wrapping the display math.
    expect(el.querySelector("p")).toBeNull();
  });

  it("splits blocks on blank lines (paragraph, math, paragraph)", () => {
    const el = parse(renderCalloutBody("First.\n\n$$\na=b\n$$\n\nLast."));
    expect(el.querySelectorAll("p")).toHaveLength(2);
    expect(el.querySelectorAll("div.cm-lp-math-block")).toHaveLength(1);
  });

  it("renders bold, italic, code, and links", () => {
    const el = parse(
      renderCalloutBody("**b** and *i* and _j_ and `c` and [t](https://x.test)")
    );
    expect(el.querySelector("strong")!.textContent).toBe("b");
    expect(el.querySelectorAll("em")).toHaveLength(2);
    expect(el.querySelector("code")!.textContent).toBe("c");
    const a = el.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://x.test");
    expect(a.textContent).toBe("t");
  });

  it("HTML-escapes text nodes to prevent injection", () => {
    const html = renderCalloutBody("a <script>alert(1)</script> b");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // Parsed back, no actual script element exists.
    expect(parse(html).querySelector("script")).toBeNull();
  });
});

describe("CalloutWidget.toDOM", () => {
  it("builds the .callout box with the marker hidden and title rendered", () => {
    const raw = "> [!note] My Title\n> Body text.";
    const dom = new CalloutWidget("note", raw).toDOM();
    expect(dom.className).toContain("markdown-content");
    const box = dom.querySelector(".callout")!;
    expect(box.classList.contains("callout-note")).toBe(true);
    expect(box.getAttribute("data-callout")).toBe("note");
    expect(box.querySelector(".callout-title")!.textContent).toBe("My Title");
    // The [!note] marker is not present anywhere in the rendered text.
    expect(dom.textContent).not.toContain("[!note]");
    expect(box.querySelector("p:not(.callout-title)")!.textContent).toBe("Body text.");
  });

  it("defaults the title to the capitalized type when none is given", () => {
    const dom = new CalloutWidget("warning", "> [!warning]\n> Careful.").toDOM();
    expect(dom.querySelector(".callout-title")!.textContent).toBe("Warning");
  });
});

/** Editor state with the app's markdown dialect, parse forced to completion. */
function stateOf(doc: string): EditorState {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, extensions: [...MarkdownMath] })],
  });
  ensureSyntaxTree(state, doc.length, 10_000);
  return state;
}

describe("findCallouts", () => {
  it("detects a `> [!note]` blockquote and captures its type and range", () => {
    const doc = "> [!note] Hi\n> Body.\n\nAfter.";
    const found = findCallouts(stateOf(doc));
    expect(found).toHaveLength(1);
    expect(found[0].type).toBe("note");
    expect(found[0].from).toBe(0);
    expect(found[0].raw).toBe("> [!note] Hi\n> Body.");
  });

  it("ignores a plain `>` blockquote", () => {
    const found = findCallouts(stateOf("> just a quote\n> more"));
    expect(found).toHaveLength(0);
  });

  it("canonicalizes unknown types to note", () => {
    const found = findCallouts(stateOf("> [!bogus] X\n> y"));
    expect(found[0].type).toBe("note");
  });
});
