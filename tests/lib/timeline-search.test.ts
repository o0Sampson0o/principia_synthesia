import { describe, it, expect } from "vitest";
import { parseTimelineSearch } from "@/lib/timeline-utils";

describe("parseTimelineSearch", () => {
  it("returns all undefined for empty params", () => {
    const result = parseTimelineSearch(new URLSearchParams());
    expect(result.q).toBeUndefined();
    expect(result.era).toBeUndefined();
    expect(result.category).toBeUndefined();
    expect(result.publisher).toBeUndefined();
    expect(result.from).toBeUndefined();
    expect(result.to).toBeUndefined();
    expect(result.page).toBe(1);
  });

  it("trims whitespace from q", () => {
    const result = parseTimelineSearch(new URLSearchParams("q=  cold+war  "));
    expect(result.q).toBe("cold war");
  });

  it("truncates q to 200 characters", () => {
    const longQ = "a".repeat(250);
    const result = parseTimelineSearch(new URLSearchParams(`q=${longQ}`));
    expect(result.q).toHaveLength(200);
  });

  it("returns undefined for empty q after trim", () => {
    const result = parseTimelineSearch(new URLSearchParams("q=   "));
    expect(result.q).toBeUndefined();
  });

  it("trims whitespace from era", () => {
    const result = parseTimelineSearch(new URLSearchParams("era=  Cold+War+Era  "));
    expect(result.era).toBe("Cold War Era");
  });

  it("returns undefined for empty era", () => {
    const result = parseTimelineSearch(new URLSearchParams("era="));
    expect(result.era).toBeUndefined();
  });

  it("drops invalid from date", () => {
    const result = parseTimelineSearch(new URLSearchParams("from=not-a-date"));
    expect(result.from).toBeUndefined();
  });

  it("drops invalid to date", () => {
    const result = parseTimelineSearch(new URLSearchParams("to=abc"));
    expect(result.to).toBeUndefined();
  });

  it("accepts valid from and to dates", () => {
    const result = parseTimelineSearch(new URLSearchParams("from=1950-01-01&to=1990-12-31"));
    expect(result.from).toBe("1950-01-01");
    expect(result.to).toBe("1990-12-31");
  });

  it("parses page correctly", () => {
    const result = parseTimelineSearch(new URLSearchParams("page=3"));
    expect(result.page).toBe(3);
  });

  it("clamps page to 1 for invalid values", () => {
    expect(parseTimelineSearch(new URLSearchParams("page=-5")).page).toBe(1);
    expect(parseTimelineSearch(new URLSearchParams("page=abc")).page).toBe(1);
  });

  it("parses all fields together", () => {
    const params = new URLSearchParams(
      "q=cold+war&era=Cold+War+Era&category=politics&publisher=acme&from=1950-01-01&to=1990-12-31&page=2"
    );
    const result = parseTimelineSearch(params);
    expect(result.q).toBe("cold war");
    expect(result.era).toBe("Cold War Era");
    expect(result.category).toBe("politics");
    expect(result.publisher).toBe("acme");
    expect(result.from).toBe("1950-01-01");
    expect(result.to).toBe("1990-12-31");
    expect(result.page).toBe(2);
  });
});
