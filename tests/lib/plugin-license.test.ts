import { describe, it, expect } from "vitest";
import { OPEN_LICENSES, canViewPluginCode, canClonePlugin } from "@/lib/plugin-license";

describe("OPEN_LICENSES", () => {
  it("is a Set", () => {
    expect(OPEN_LICENSES).toBeInstanceOf(Set);
  });

  it("contains all 7 open license identifiers in lowercase", () => {
    expect(OPEN_LICENSES.has("mit")).toBe(true);
    expect(OPEN_LICENSES.has("apache-2.0")).toBe(true);
    expect(OPEN_LICENSES.has("bsd-2-clause")).toBe(true);
    expect(OPEN_LICENSES.has("bsd-3-clause")).toBe(true);
    expect(OPEN_LICENSES.has("isc")).toBe(true);
    expect(OPEN_LICENSES.has("cc0-1.0")).toBe(true);
    expect(OPEN_LICENSES.has("cc-by-4.0")).toBe(true);
    expect(OPEN_LICENSES.size).toBe(7);
  });

  it("does not contain non-open licenses", () => {
    expect(OPEN_LICENSES.has("gpl-3.0")).toBe(false);
    expect(OPEN_LICENSES.has("proprietary")).toBe(false);
    expect(OPEN_LICENSES.has("unlicensed")).toBe(false);
  });
});

describe("canViewPluginCode", () => {
  it("returns false for null", () => {
    expect(canViewPluginCode(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(canViewPluginCode(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(canViewPluginCode("")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(canViewPluginCode("   ")).toBe(false);
  });

  it("returns false for GPL-3.0", () => {
    expect(canViewPluginCode("GPL-3.0")).toBe(false);
  });

  it("returns false for proprietary", () => {
    expect(canViewPluginCode("proprietary")).toBe(false);
  });

  it("returns false for unlicensed", () => {
    expect(canViewPluginCode("unlicensed")).toBe(false);
  });

  it("returns false for CC-BY-SA-4.0", () => {
    expect(canViewPluginCode("CC-BY-SA-4.0")).toBe(false);
  });

  it("returns true for MIT (uppercase)", () => {
    expect(canViewPluginCode("MIT")).toBe(true);
  });

  it("returns true for mit (lowercase)", () => {
    expect(canViewPluginCode("mit")).toBe(true);
  });

  it("returns true for Apache-2.0", () => {
    expect(canViewPluginCode("Apache-2.0")).toBe(true);
  });

  it("returns true for APACHE-2.0 (all caps)", () => {
    expect(canViewPluginCode("APACHE-2.0")).toBe(true);
  });

  it("returns true for MIT with surrounding whitespace", () => {
    expect(canViewPluginCode("  MIT  ")).toBe(true);
  });

  it("returns true for bsd-2-clause", () => {
    expect(canViewPluginCode("bsd-2-clause")).toBe(true);
  });

  it("returns true for bsd-3-clause", () => {
    expect(canViewPluginCode("bsd-3-clause")).toBe(true);
  });

  it("returns true for isc", () => {
    expect(canViewPluginCode("isc")).toBe(true);
  });

  it("returns true for cc0-1.0", () => {
    expect(canViewPluginCode("cc0-1.0")).toBe(true);
  });

  it("returns true for cc-by-4.0", () => {
    expect(canViewPluginCode("cc-by-4.0")).toBe(true);
  });
});

describe("canClonePlugin", () => {
  it("returns false for null", () => {
    expect(canClonePlugin(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(canClonePlugin(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(canClonePlugin("")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(canClonePlugin("   ")).toBe(false);
  });

  it("returns false for GPL-3.0", () => {
    expect(canClonePlugin("GPL-3.0")).toBe(false);
  });

  it("returns false for proprietary", () => {
    expect(canClonePlugin("proprietary")).toBe(false);
  });

  it("returns false for unlicensed", () => {
    expect(canClonePlugin("unlicensed")).toBe(false);
  });

  it("returns false for CC-BY-SA-4.0", () => {
    expect(canClonePlugin("CC-BY-SA-4.0")).toBe(false);
  });

  it("returns true for MIT (uppercase)", () => {
    expect(canClonePlugin("MIT")).toBe(true);
  });

  it("returns true for mit (lowercase)", () => {
    expect(canClonePlugin("mit")).toBe(true);
  });

  it("returns true for Apache-2.0", () => {
    expect(canClonePlugin("Apache-2.0")).toBe(true);
  });

  it("returns true for APACHE-2.0 (all caps)", () => {
    expect(canClonePlugin("APACHE-2.0")).toBe(true);
  });

  it("returns true for MIT with surrounding whitespace", () => {
    expect(canClonePlugin("  MIT  ")).toBe(true);
  });

  it("returns true for bsd-2-clause", () => {
    expect(canClonePlugin("bsd-2-clause")).toBe(true);
  });

  it("returns true for bsd-3-clause", () => {
    expect(canClonePlugin("bsd-3-clause")).toBe(true);
  });

  it("returns true for isc", () => {
    expect(canClonePlugin("isc")).toBe(true);
  });

  it("returns true for cc0-1.0", () => {
    expect(canClonePlugin("cc0-1.0")).toBe(true);
  });

  it("returns true for cc-by-4.0", () => {
    expect(canClonePlugin("cc-by-4.0")).toBe(true);
  });

  it("is symmetric with canViewPluginCode", () => {
    const testCases = [null, undefined, "", "MIT", "mit", "GPL-3.0", "Apache-2.0", "ISC", "  bsd-3-clause  "];
    for (const tc of testCases) {
      expect(canClonePlugin(tc)).toBe(canViewPluginCode(tc));
    }
  });
});
