// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { Selection } from "../../cli/ps-sync/src/selection";

describe("Selection — defaults and guards", () => {
  it("selects everything when unfiltered", () => {
    const s = new Selection(undefined, undefined);
    expect(s.active).toBe(false);
    expect(s.isSelected("anything")).toBe(true);
    expect(s.isSelected("intro", "relativity")).toBe(true);
  });

  it("rejects --only and --except together", () => {
    expect(() => new Selection("a", "b")).toThrow(/not both/);
  });

  it("rejects an empty --only (which would sync nothing)", () => {
    expect(() => new Selection("", undefined)).toThrow(/nothing would sync/);
  });
});

describe("Selection — bare terms", () => {
  it("--only allows just the named slug", () => {
    const s = new Selection("intro", undefined);
    expect(s.isSelected("intro")).toBe(true);
    expect(s.isSelected("other")).toBe(false);
    expect(s.inclusive).toBe(true);
  });

  it("--except blocks the named slug and allows the rest", () => {
    const s = new Selection(undefined, "intro");
    expect(s.isSelected("intro")).toBe(false);
    expect(s.isSelected("other")).toBe(true);
    expect(s.inclusive).toBe(false);
  });

  it("naming a book selects every section inside it", () => {
    const s = new Selection("relativity", undefined);
    expect(s.isSelected("relativity")).toBe(true); // the book itself
    expect(s.isSelected("intro", "relativity")).toBe(true); // a section of it
    expect(s.isSelected("intro", "mechanics")).toBe(false); // another book's
  });

  it("a bare section slug matches that section in every book", () => {
    const s = new Selection("intro", undefined);
    expect(s.isSelected("intro", "relativity")).toBe(true);
    expect(s.isSelected("intro", "mechanics")).toBe(true);
  });

  it("trims whitespace and ignores empty entries", () => {
    const s = new Selection(" a , , b ", undefined);
    expect(s.isSelected("a")).toBe(true);
    expect(s.isSelected("b")).toBe(true);
    expect(s.isSelected("c")).toBe(false);
  });
});

describe("Selection — book-qualified terms", () => {
  it("book/section pins one section of one book", () => {
    const s = new Selection("relativity/intro", undefined);
    expect(s.isSelected("intro", "relativity")).toBe(true);
    expect(s.isSelected("intro", "mechanics")).toBe(false);
    expect(s.isSelected("intro", null)).toBe(false);
    expect(s.isSelected("relativity")).toBe(false);
  });

  it("--except book/section excludes only that one", () => {
    const s = new Selection(undefined, "mechanics/intro");
    expect(s.isSelected("intro", "mechanics")).toBe(false);
    expect(s.isSelected("intro", "relativity")).toBe(true);
    expect(s.isSelected("intro", null)).toBe(true);
  });

  it("mixes qualified and bare terms in one list", () => {
    const s = new Selection("relativity/intro,glossary", undefined);
    expect(s.isSelected("intro", "relativity")).toBe(true);
    expect(s.isSelected("glossary", null)).toBe(true);
    expect(s.isSelected("intro", "mechanics")).toBe(false);
  });
});

describe("Selection — typo reporting", () => {
  it("reports terms that matched nothing", () => {
    const s = new Selection("intro,typpo", undefined);
    s.isSelected("intro");
    expect(s.unmatched()).toEqual(["typpo"]);
  });

  it("counts a qualified term as matched only on a real hit", () => {
    const s = new Selection("relativity/intro", undefined);
    s.isSelected("intro", "mechanics"); // wrong book — not a match
    expect(s.unmatched()).toEqual(["relativity/intro"]);
    s.isSelected("intro", "relativity");
    expect(s.unmatched()).toEqual([]);
  });

  it("warns on stderr for unmatched terms", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = new Selection(undefined, "ghost");
    s.warnUnmatched();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ghost"));
    warn.mockRestore();
  });
});
