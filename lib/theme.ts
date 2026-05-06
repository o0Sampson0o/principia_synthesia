import type { ThemeTokens } from "@/db/schema"

export const defaultLight: ThemeTokens = {
  background:       "#ffffff",
  foreground:       "#18181b",
  muted:            "#f4f4f5",
  mutedForeground:  "#71717a",
  border:           "#e4e4e7",
  link:             "#71717a",
  linkHover:        "#18181b",
  codeBackground:   "#f4f4f5",
  surface:          "#ffffff",
  surfaceHover:     "#f4f4f5",
  primaryBtn:       "#18181b",
  primaryBtnText:   "#ffffff",
  inputBorder:      "#e4e4e7",
  inputFocusBorder: "#a1a1aa",
  secondaryText:    "#71717a",
}

export const defaultDark: ThemeTokens = {
  background:       "#09090b",
  foreground:       "#fafafa",
  muted:            "#27272a",
  mutedForeground:  "#a1a1aa",
  border:           "#3f3f46",
  link:             "#a1a1aa",
  linkHover:        "#fafafa",
  codeBackground:   "#27272a",
  surface:          "#09090b",
  surfaceHover:     "#18181b",
  primaryBtn:       "#fafafa",
  primaryBtnText:   "#09090b",
  inputBorder:      "#3f3f46",
  inputFocusBorder: "#71717a",
  secondaryText:    "#a1a1aa",
}

function tokensToVars(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([key, value]) => `  --${camel2kebab(key)}: ${value};`)
    .join("\n")
}

function camel2kebab(str: string): string {
  return str.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)
}

export function buildThemeStyle(light: ThemeTokens, dark: ThemeTokens): string {
  return `
:root {
${tokensToVars(light)}
}
@media (prefers-color-scheme: dark) {
  :root {
${tokensToVars(dark)}
  }
}
`.trim()
}

export function defaultThemeStyle(): string {
  return buildThemeStyle(defaultLight, defaultDark)
}
