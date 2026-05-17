// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildThemeStyle, defaultThemeStyle, defaultLight, defaultDark } from "@/lib/theme";
import type { ThemeTokens } from "@/db/schema";


const EXPECTED_CSS_VARS: string[] = [
  "--background",
  "--foreground",
  "--muted",
  "--muted-foreground",
  "--border",
  "--link",
  "--link-hover",
  "--code-background",
  "--surface",
  "--surface-hover",
  "--primary-btn",
  "--primary-btn-text",
  "--input-border",
  "--input-focus-border",
  "--secondary-text",
];

describe("buildThemeStyle", () => {
  it("output contains :root {", () => {
    const style = buildThemeStyle(defaultLight, defaultDark);
    expect(style).toContain(":root {");
  });

  it("output contains @media (prefers-color-scheme: dark)", () => {
    const style = buildThemeStyle(defaultLight, defaultDark);
    expect(style).toContain("@media (prefers-color-scheme: dark)");
  });

  it("all 15 token keys appear as kebab-case CSS vars in the output", () => {
    const style = buildThemeStyle(defaultLight, defaultDark);
    for (const cssVar of EXPECTED_CSS_VARS) {
      expect(style).toContain(cssVar);
    }
  });

  it("correctly converts camelCase 'mutedForeground' to '--muted-foreground'", () => {
    const style = buildThemeStyle(defaultLight, defaultDark);
    expect(style).toContain("--muted-foreground:");
    // Should NOT contain the camelCase version as a property
    expect(style).not.toContain("--mutedForeground:");
  });

  it("correctly converts camelCase 'primaryBtnText' to '--primary-btn-text'", () => {
    const style = buildThemeStyle(defaultLight, defaultDark);
    expect(style).toContain("--primary-btn-text:");
    expect(style).not.toContain("--primaryBtnText:");
  });

  it("correctly converts camelCase 'linkHover' to '--link-hover'", () => {
    const style = buildThemeStyle(defaultLight, defaultDark);
    expect(style).toContain("--link-hover:");
  });

  it("correctly converts camelCase 'codeBackground' to '--code-background'", () => {
    const style = buildThemeStyle(defaultLight, defaultDark);
    expect(style).toContain("--code-background:");
  });

  it("correctly converts camelCase 'surfaceHover' to '--surface-hover'", () => {
    const style = buildThemeStyle(defaultLight, defaultDark);
    expect(style).toContain("--surface-hover:");
  });

  it("light token values appear in :root block", () => {
    const style = buildThemeStyle(defaultLight, defaultDark);
    // defaultLight.background is "#ffffff" — it should appear in the :root block
    expect(style).toContain("#ffffff");
  });

  it("dark token values appear in the dark media query block", () => {
    const style = buildThemeStyle(defaultLight, defaultDark);
    // defaultDark.background is "#09090b"
    expect(style).toContain("#09090b");
  });

  it("uses custom tokens when provided", () => {
    const customLight: ThemeTokens = { ...defaultLight, background: "#ff0000" };
    const customDark: ThemeTokens = { ...defaultDark, background: "#0000ff" };
    const style = buildThemeStyle(customLight, customDark);
    expect(style).toContain("#ff0000");
    expect(style).toContain("#0000ff");
  });

  it("output has exactly the right number of CSS variable declarations (15 per theme = 30 total)", () => {
    const style = buildThemeStyle(defaultLight, defaultDark);
    const matches = style.match(/--[a-z-]+:/g) || [];
    expect(matches).toHaveLength(30); // 15 light + 15 dark
  });
});

describe("defaultThemeStyle", () => {
  it("returns a non-empty string", () => {
    const style = defaultThemeStyle();
    expect(typeof style).toBe("string");
    expect(style.length).toBeGreaterThan(0);
  });

  it("includes the default light background color #ffffff", () => {
    const style = defaultThemeStyle();
    expect(style).toContain("#ffffff");
  });

  it("includes the default dark background color #09090b", () => {
    const style = defaultThemeStyle();
    expect(style).toContain("#09090b");
  });

  it("produces the same output as buildThemeStyle(defaultLight, defaultDark)", () => {
    expect(defaultThemeStyle()).toBe(buildThemeStyle(defaultLight, defaultDark));
  });

  it("contains all 15 CSS variable names", () => {
    const style = defaultThemeStyle();
    for (const cssVar of EXPECTED_CSS_VARS) {
      expect(style).toContain(cssVar);
    }
  });
});
