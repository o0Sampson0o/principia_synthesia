// @vitest-environment node
import { describe, it, expect } from "vitest";
import { matchSlashQuery, filterSlashCommands } from "@/lib/live-preview/slash-menu";

describe("matchSlashQuery", () => {
  it("opens on / at the start of a line", () => {
    expect(matchSlashQuery("/")).toEqual({ query: "" });
    expect(matchSlashQuery("/head")).toEqual({ query: "head" });
  });

  it("opens after list/quote marks (block content still starts there)", () => {
    expect(matchSlashQuery("- /")).toEqual({ query: "" });
    expect(matchSlashQuery("> /quote")).toEqual({ query: "quote" });
    expect(matchSlashQuery("  /tab")).toEqual({ query: "tab" });
  });

  it("does NOT open for / mid-sentence", () => {
    expect(matchSlashQuery("see and/or later")).toBeNull();
    expect(matchSlashQuery("path/to/file")).toBeNull();
    expect(matchSlashQuery("word /x")).toBeNull(); // preceded by real text
  });
});

describe("filterSlashCommands", () => {
  it("returns all commands for an empty query", () => {
    expect(filterSlashCommands("").length).toBeGreaterThanOrEqual(12);
  });

  it("matches by label", () => {
    const hits = filterSlashCommands("head").map((c) => c.label);
    expect(hits).toContain("Heading 1");
    expect(hits).toContain("Heading 2");
  });

  it("matches by hidden keyword (todo → To-do, admonition → Callout)", () => {
    expect(filterSlashCommands("checkbox").map((c) => c.label)).toContain("To-do");
    expect(filterSlashCommands("admonition").map((c) => c.label)).toContain("Callout");
    expect(filterSlashCommands("latex").map((c) => c.label)).toContain("Math block");
  });

  it("strips the keyword blob from displayed options", () => {
    const opt = filterSlashCommands("head")[0] as { info?: string };
    expect(opt.info).toBeUndefined();
  });

  it("returns nothing for a nonsense query", () => {
    expect(filterSlashCommands("zzzznotacommand")).toHaveLength(0);
  });
});
