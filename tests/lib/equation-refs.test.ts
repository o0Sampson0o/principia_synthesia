import { describe, it, expect } from "vitest";
import { resolveEquationRefs, splitRows, segmentSource } from "@/lib/equation-refs";

describe("splitRows", () => {
  it("splits an environment body at top-level row breaks", () => {
    expect(splitRows("a &= b \\\\ c &= d")).toHaveLength(2);
  });

  it("does not split on a row break nested in another environment", () => {
    // \begin{cases} carries its own \\ — counting it would shift every later
    // equation number.
    const body = "f = \\begin{cases} 1 \\\\ 2 \\end{cases} \\\\ g = 3";
    expect(splitRows(body)).toHaveLength(2);
  });

  it("keeps a single row when there is no break", () => {
    expect(splitRows("x = 1")).toHaveLength(1);
  });
});

describe("segmentSource", () => {
  it("never treats fenced code as math", () => {
    const segs = segmentSource("before\n\n```\n$$ x = 1 $$\n```\n\nafter");
    expect(segs.some((s) => s.kind === "displayMath")).toBe(false);
  });

  it("ignores an escaped dollar", () => {
    const segs = segmentSource("costs \\$5 and \\$6");
    expect(segs.some((s) => s.kind === "inlineMath")).toBe(false);
  });

  it("finds display and inline math", () => {
    const segs = segmentSource("see $a$ and $$b$$");
    expect(segs.filter((s) => s.kind === "inlineMath")).toHaveLength(1);
    expect(segs.filter((s) => s.kind === "displayMath")).toHaveLength(1);
  });
});

describe("resolveEquationRefs", () => {
  it("numbers align rows and resolves a reference to them", () => {
    const src = [
      "$$\\begin{align} a &= b \\label{one} \\\\ c &= d \\label{two} \\end{align}$$",
      "",
      "As $\\eqref{two}$ shows.",
    ].join("\n");
    const { source, numbers } = resolveEquationRefs(src);
    expect(numbers.get("one")).toBe(1);
    expect(numbers.get("two")).toBe(2);
    expect(source).toContain("\\href{#eq-two}{(2)}");
    expect(source).not.toContain("\\label");
  });

  it("continues numbering across separate blocks", () => {
    const src = "$$\\begin{align} a &= b \\end{align}$$\n\n$$\\begin{equation} c = d \\label{k} \\end{equation}$$";
    const { numbers } = resolveEquationRefs(src);
    expect(numbers.get("k")).toBe(2);
  });

  it("does not number starred environments or bare display math", () => {
    const src = [
      "$$\\begin{align*} a &= b \\end{align*}$$",
      "$$ x = 1 $$",
      "$$\\begin{equation} y = 2 \\label{first} \\end{equation}$$",
    ].join("\n\n");
    expect(resolveEquationRefs(src).numbers.get("first")).toBe(1);
  });

  it("skips rows that opt out with \\nonumber", () => {
    const src =
      "$$\\begin{align} a &= b \\nonumber \\\\ c &= d \\label{k} \\end{align}$$";
    expect(resolveEquationRefs(src).numbers.get("k")).toBe(1);
  });

  it("counts a nested cases block as one row", () => {
    const src = [
      "$$\\begin{align} f &= \\begin{cases} 1 \\\\ 2 \\end{cases} \\\\ g &= 3 \\label{g} \\end{align}$$",
    ].join("\n");
    expect(resolveEquationRefs(src).numbers.get("g")).toBe(2);
  });

  it("resolves a forward reference", () => {
    const src = [
      "See $\\eqref{later}$ below.",
      "",
      "$$\\begin{equation} x = 1 \\label{later} \\end{equation}$$",
    ].join("\n");
    expect(resolveEquationRefs(src).source).toContain("\\href{#eq-later}{(1)}");
  });

  it("renders a prose reference as a markdown link", () => {
    const src = "$$\\begin{equation} x = 1 \\label{k} \\end{equation}$$\n\nfrom \\eqref{k} we get";
    expect(resolveEquationRefs(src).source).toContain("[(1)](#eq-k)");
  });

  it("reports an unknown label and leaves it untouched", () => {
    const { source, unresolved } = resolveEquationRefs("see $\\eqref{ghost}$");
    expect(unresolved).toEqual(["ghost"]);
    expect(source).toContain("\\eqref{ghost}");
  });

  it("leaves references inside code alone", () => {
    const src = "$$\\begin{equation} x = 1 \\label{k} \\end{equation}$$\n\n`\\eqref{k}`";
    expect(resolveEquationRefs(src).source).toContain("`\\eqref{k}`");
  });

  it("anchors the number so a reference lands on the row", () => {
    const src = "$$\\begin{align} a &= b \\\\ c &= d \\label{two} \\end{align}$$";
    expect(resolveEquationRefs(src).source).toContain("\\htmlId{eq-two}{2}");
  });
});
