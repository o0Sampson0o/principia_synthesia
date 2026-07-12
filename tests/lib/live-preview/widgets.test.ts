import { describe, it, expect, vi } from "vitest";
import katex from "katex";
import {
  InlineMathWidget,
  BlockMathWidget,
  renderKatex,
} from "@/lib/live-preview/widgets/math";
import { WikilinkChipWidget } from "@/lib/live-preview/widgets/wikilink";
import { ImageWidget } from "@/lib/live-preview/widgets/image";
import { BulletWidget, HrWidget } from "@/lib/live-preview/widgets/misc";

describe("math widgets", () => {
  it("eq() is true for the same formula (DOM gets reused, no flicker)", () => {
    expect(new InlineMathWidget("x^2").eq(new InlineMathWidget("x^2"))).toBe(true);
    expect(new InlineMathWidget("x^2").eq(new InlineMathWidget("x^3"))).toBe(false);
    expect(new BlockMathWidget("\\int f").eq(new BlockMathWidget("\\int f"))).toBe(true);
  });

  it("caches KaTeX output — one renderToString call per distinct formula", () => {
    const spy = vi.spyOn(katex, "renderToString");
    renderKatex("a_{cache} + b", false);
    renderKatex("a_{cache} + b", false);
    renderKatex("a_{cache} + b", false);
    expect(spy).toHaveBeenCalledTimes(1);
    // display mode is a separate cache entry
    renderKatex("a_{cache} + b", true);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("renders KaTeX markup into the widget DOM", () => {
    const dom = new InlineMathWidget("x^2").toDOM();
    expect(dom.className).toBe("cm-lp-math");
    expect(dom.querySelector(".katex")).toBeTruthy();
  });

  it("never throws on invalid TeX", () => {
    expect(() => renderKatex("\\undefinedmacro{", false)).not.toThrow();
  });
});

describe("wikilink chip", () => {
  it("eq() by raw text", () => {
    const a = new WikilinkChipWidget("[[p:articles:article-x]]");
    expect(a.eq(new WikilinkChipWidget("[[p:articles:article-x]]"))).toBe(true);
    expect(a.eq(new WikilinkChipWidget("[[p:articles:article-y]]"))).toBe(false);
  });

  it("renders the label (or slug) with the target in the title", () => {
    const dom = new WikilinkChipWidget("[[p:books:book-z|Zed]]").toDOM();
    expect(dom.textContent).toBe("Zed");
    expect(dom.title).toContain("/p/books/book-z");
    const bare = new WikilinkChipWidget("[[p:books:book-z]]").toDOM();
    expect(bare.textContent).toBe("book-z");
  });

  it("lets CM handle plain clicks but claims Mod-clicks", () => {
    const w = new WikilinkChipWidget("[[p:articles:article-x]]");
    expect(w.ignoreEvent(new MouseEvent("mousedown"))).toBe(false);
    expect(w.ignoreEvent(new MouseEvent("mousedown", { ctrlKey: true }))).toBe(true);
  });
});

describe("image / misc widgets", () => {
  it("image eq() by src+alt and renders a lazy <img>", () => {
    const a = new ImageWidget("/images/p/x.png", "diagram");
    expect(a.eq(new ImageWidget("/images/p/x.png", "diagram"))).toBe(true);
    expect(a.eq(new ImageWidget("/images/p/x.png", "other"))).toBe(false);
    const img = a.toDOM().querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/images/p/x.png");
    expect(img.alt).toBe("diagram");
    expect(img.loading).toBe("lazy");
  });

  it("bullet renders the em-dash, hr the three dots", () => {
    expect(new BulletWidget().toDOM().textContent).toBe("—");
    expect(new HrWidget().toDOM().textContent).toBe("· · ·");
  });
});
