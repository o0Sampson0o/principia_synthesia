// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getPageCommands, filterPageCommands } from "@/lib/page-commands";

describe("getPageCommands", () => {
  it("hides auth-only pages from logged-out viewers", () => {
    const commands = getPageCommands(null);
    const hrefs = commands.map((c) => c.href);
    expect(hrefs).toContain("/search");
    expect(hrefs).toContain("/pricing");
    expect(hrefs).not.toContain("/settings");
    expect(hrefs).not.toContain("/settings/api-tokens");
    expect(hrefs).not.toContain("/notifications");
  });

  it("includes all settings pages and the personal page when logged in", () => {
    const commands = getPageCommands("alice");
    const hrefs = commands.map((c) => c.href);
    expect(hrefs).toContain("/settings");
    expect(hrefs).toContain("/settings/account");
    expect(hrefs).toContain("/settings/theme");
    expect(hrefs).toContain("/settings/api-tokens");
    expect(hrefs).toContain("/settings/onboarding");
    expect(hrefs).toContain("/alice");
  });
});

describe("filterPageCommands", () => {
  const commands = getPageCommands("alice");

  it("returns everything for an empty query", () => {
    expect(filterPageCommands(commands, "")).toHaveLength(commands.length);
    expect(filterPageCommands(commands, "   ")).toHaveLength(commands.length);
  });

  it("matches on label, case-insensitively", () => {
    const hits = filterPageCommands(commands, "SETTINGS");
    expect(hits.length).toBeGreaterThanOrEqual(4);
    expect(hits.every((c) => c.href.startsWith("/settings"))).toBe(true);
  });

  it("matches on keywords (token → api-tokens, dark → theme, tour → onboarding)", () => {
    expect(filterPageCommands(commands, "token").map((c) => c.href)).toContain("/settings/api-tokens");
    expect(filterPageCommands(commands, "dark").map((c) => c.href)).toContain("/settings/theme");
    expect(filterPageCommands(commands, "tour").map((c) => c.href)).toContain("/settings/onboarding");
    expect(filterPageCommands(commands, "profile").map((c) => c.href)).toContain("/alice");
  });

  it("requires every term to match", () => {
    expect(filterPageCommands(commands, "settings theme")).toHaveLength(1);
    expect(filterPageCommands(commands, "settings zebra")).toHaveLength(0);
  });
});
