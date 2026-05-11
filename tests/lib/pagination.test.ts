// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getPageParams } from "@/lib/pagination";

describe("getPageParams", () => {
  it("returns page=1 and offset=0 when no page param is provided", () => {
    const result = getPageParams({});
    expect(result.page).toBe(1);
    expect(result.offset).toBe(0);
  });

  it("returns the default perPage when not specified", () => {
    const result = getPageParams({});
    expect(result.perPage).toBe(20);
  });

  it("returns page=2 and offset=perPage for page=2", () => {
    const result = getPageParams({ page: "2" });
    expect(result.page).toBe(2);
    expect(result.offset).toBe(20); // default perPage
  });

  it("computes offset correctly: offset = (page - 1) * perPage", () => {
    const result = getPageParams({ page: "3" }, 10);
    expect(result.page).toBe(3);
    expect(result.offset).toBe(20); // (3 - 1) * 10
  });

  it("propagates custom perPage correctly", () => {
    const result = getPageParams({ page: "1" }, 50);
    expect(result.perPage).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("clamps negative page to 1", () => {
    const result = getPageParams({ page: "-5" });
    expect(result.page).toBe(1);
    expect(result.offset).toBe(0);
  });

  it("clamps page=0 to 1", () => {
    const result = getPageParams({ page: "0" });
    expect(result.page).toBe(1);
    expect(result.offset).toBe(0);
  });

  it("parses string '3' as page 3", () => {
    const result = getPageParams({ page: "3" }, 20);
    expect(result.page).toBe(3);
    expect(result.offset).toBe(40);
  });

  it("treats non-numeric page string as NaN (parseInt returns NaN for non-numeric input)", () => {
    // parseInt("abc", 10) === NaN; Math.max(1, NaN) === NaN
    // The implementation does not special-case NaN — callers should pass valid integers.
    const result = getPageParams({ page: "abc" });
    expect(Number.isNaN(result.page)).toBe(true);
  });

  it("treats missing page key (undefined value) as page=1", () => {
    const result = getPageParams({ page: undefined });
    expect(result.page).toBe(1);
    expect(result.offset).toBe(0);
  });

  it("treats array value for page as page=1 (only string is used)", () => {
    // When page is an array, it falls back to "1" because typeof raw !== "string"
    const result = getPageParams({ page: ["2", "3"] });
    expect(result.page).toBe(1);
    expect(result.offset).toBe(0);
  });

  it("uses perPage=20 as the default and multiplies correctly for page=4", () => {
    const result = getPageParams({ page: "4" });
    expect(result.page).toBe(4);
    expect(result.offset).toBe(60); // (4 - 1) * 20
    expect(result.perPage).toBe(20);
  });
});
