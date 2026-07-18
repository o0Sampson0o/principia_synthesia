import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "@/lib/db-errors";

describe("isUniqueViolation", () => {
  it("detects a direct Postgres 23505 code", () => {
    expect(isUniqueViolation(Object.assign(new Error("boom"), { code: "23505" }))).toBe(true);
  });

  it("detects a 23505 nested in cause (driver wrapping)", () => {
    expect(
      isUniqueViolation(Object.assign(new Error("boom"), { cause: { code: "23505" } }))
    ).toBe(true);
  });

  it("falls back to the duplicate-key message", () => {
    expect(
      isUniqueViolation(new Error('duplicate key value violates unique constraint "x"'))
    ).toBe(true);
  });

  it("rejects other errors and non-errors", () => {
    expect(isUniqueViolation(new Error("connection refused"))).toBe(false);
    expect(isUniqueViolation(Object.assign(new Error("x"), { code: "23503" }))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
