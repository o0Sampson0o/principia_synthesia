// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseTable } from "@/lib/live-preview/widgets/table";

describe("parseTable", () => {
  it("parses headers, alignment, and rows", () => {
    const src = `| Name | Value |
| :--- | ---: |
| alpha | 1 |
| beta | 2 |`;
    const t = parseTable(src)!;
    expect(t.headers).toEqual(["Name", "Value"]);
    expect(t.aligns).toEqual(["left", "right"]);
    expect(t.rows).toEqual([
      ["alpha", "1"],
      ["beta", "2"],
    ]);
  });

  it("handles center alignment and missing outer pipes", () => {
    const src = `H1 | H2
:--: | ---
a | b`;
    const t = parseTable(src)!;
    expect(t.aligns).toEqual(["center", null]);
    expect(t.headers).toEqual(["H1", "H2"]);
    expect(t.rows).toEqual([["a", "b"]]);
  });

  it("respects escaped pipes inside cells", () => {
    const src = `| A | B |
| --- | --- |
| x \\| y | z |`;
    const t = parseTable(src)!;
    expect(t.rows[0][0]).toBe("x \\| y");
    expect(t.rows[0][1]).toBe("z");
  });

  it("returns null for a non-table / missing delimiter row", () => {
    expect(parseTable("just one line")).toBeNull();
    expect(parseTable("| a | b |\n| not | delim |")).toBeNull();
  });
});
