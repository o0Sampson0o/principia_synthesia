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

// ─── Presets ──────────────────────────────────────────────────────────────────

export type Preset = {
  name: string
  light: ThemeTokens
  dark: ThemeTokens
}

export const PRESETS: Preset[] = [
  {
    name: "Default",
    light: defaultLight,
    dark: defaultDark,
  },
  {
    name: "Sepia",
    light: {
      background:       "#faf6f0",
      foreground:       "#2c2416",
      muted:            "#f0e8d8",
      mutedForeground:  "#8a7055",
      border:           "#ddd0b8",
      link:             "#8a7055",
      linkHover:        "#2c2416",
      codeBackground:   "#f0e8d8",
      surface:          "#faf6f0",
      surfaceHover:     "#f0e8d8",
      primaryBtn:       "#2c2416",
      primaryBtnText:   "#faf6f0",
      inputBorder:      "#ddd0b8",
      inputFocusBorder: "#8a7055",
      secondaryText:    "#8a7055",
    },
    dark: {
      background:       "#1a140d",
      foreground:       "#f0e6d0",
      muted:            "#2c2416",
      mutedForeground:  "#9a845e",
      border:           "#3d3020",
      link:             "#9a845e",
      linkHover:        "#f0e6d0",
      codeBackground:   "#2c2416",
      surface:          "#1a140d",
      surfaceHover:     "#2c2416",
      primaryBtn:       "#f0e6d0",
      primaryBtnText:   "#1a140d",
      inputBorder:      "#3d3020",
      inputFocusBorder: "#9a845e",
      secondaryText:    "#9a845e",
    },
  },
  {
    name: "Nord",
    light: {
      background:       "#eceff4",
      foreground:       "#2e3440",
      muted:            "#e5e9f0",
      mutedForeground:  "#4c566a",
      border:           "#d8dee9",
      link:             "#5e81ac",
      linkHover:        "#2e3440",
      codeBackground:   "#e5e9f0",
      surface:          "#eceff4",
      surfaceHover:     "#e5e9f0",
      primaryBtn:       "#5e81ac",
      primaryBtnText:   "#eceff4",
      inputBorder:      "#d8dee9",
      inputFocusBorder: "#5e81ac",
      secondaryText:    "#4c566a",
    },
    dark: {
      background:       "#2e3440",
      foreground:       "#eceff4",
      muted:            "#3b4252",
      mutedForeground:  "#8090a4",
      border:           "#434c5e",
      link:             "#88c0d0",
      linkHover:        "#eceff4",
      codeBackground:   "#3b4252",
      surface:          "#2e3440",
      surfaceHover:     "#3b4252",
      primaryBtn:       "#88c0d0",
      primaryBtnText:   "#2e3440",
      inputBorder:      "#434c5e",
      inputFocusBorder: "#88c0d0",
      secondaryText:    "#8090a4",
    },
  },
  {
    name: "Rosé Pine",
    light: {
      background:       "#faf4ed",
      foreground:       "#575279",
      muted:            "#f2e9de",
      mutedForeground:  "#9893a5",
      border:           "#dfdad9",
      link:             "#907aa9",
      linkHover:        "#575279",
      codeBackground:   "#f2e9de",
      surface:          "#faf4ed",
      surfaceHover:     "#f2e9de",
      primaryBtn:       "#575279",
      primaryBtnText:   "#faf4ed",
      inputBorder:      "#dfdad9",
      inputFocusBorder: "#907aa9",
      secondaryText:    "#9893a5",
    },
    dark: {
      background:       "#191724",
      foreground:       "#e0def4",
      muted:            "#26233a",
      mutedForeground:  "#6e6a86",
      border:           "#403d52",
      link:             "#c4a7e7",
      linkHover:        "#e0def4",
      codeBackground:   "#26233a",
      surface:          "#191724",
      surfaceHover:     "#26233a",
      primaryBtn:       "#c4a7e7",
      primaryBtnText:   "#191724",
      inputBorder:      "#403d52",
      inputFocusBorder: "#c4a7e7",
      secondaryText:    "#6e6a86",
    },
  },
  {
    name: "Solarized",
    light: {
      background:       "#fdf6e3",
      foreground:       "#657b83",
      muted:            "#eee8d5",
      mutedForeground:  "#93a1a1",
      border:           "#ddd6c1",
      link:             "#268bd2",
      linkHover:        "#073642",
      codeBackground:   "#eee8d5",
      surface:          "#fdf6e3",
      surfaceHover:     "#eee8d5",
      primaryBtn:       "#268bd2",
      primaryBtnText:   "#fdf6e3",
      inputBorder:      "#ddd6c1",
      inputFocusBorder: "#268bd2",
      secondaryText:    "#93a1a1",
    },
    dark: {
      background:       "#002b36",
      foreground:       "#839496",
      muted:            "#073642",
      mutedForeground:  "#586e75",
      border:           "#0d4554",
      link:             "#2aa198",
      linkHover:        "#93a1a1",
      codeBackground:   "#073642",
      surface:          "#002b36",
      surfaceHover:     "#073642",
      primaryBtn:       "#2aa198",
      primaryBtnText:   "#002b36",
      inputBorder:      "#0d4554",
      inputFocusBorder: "#2aa198",
      secondaryText:    "#586e75",
    },
  },
  {
    name: "Gruvbox",
    light: {
      background:       "#fbf1c7",
      foreground:       "#3c3836",
      muted:            "#f2e5bc",
      mutedForeground:  "#7c6f64",
      border:           "#d5c4a1",
      link:             "#076678",
      linkHover:        "#3c3836",
      codeBackground:   "#f2e5bc",
      surface:          "#fbf1c7",
      surfaceHover:     "#f2e5bc",
      primaryBtn:       "#3c3836",
      primaryBtnText:   "#fbf1c7",
      inputBorder:      "#d5c4a1",
      inputFocusBorder: "#076678",
      secondaryText:    "#7c6f64",
    },
    dark: {
      background:       "#282828",
      foreground:       "#ebdbb2",
      muted:            "#3c3836",
      mutedForeground:  "#a89984",
      border:           "#504945",
      link:             "#83a598",
      linkHover:        "#ebdbb2",
      codeBackground:   "#3c3836",
      surface:          "#282828",
      surfaceHover:     "#3c3836",
      primaryBtn:       "#83a598",
      primaryBtnText:   "#282828",
      inputBorder:      "#504945",
      inputFocusBorder: "#83a598",
      secondaryText:    "#a89984",
    },
  },
  {
    name: "Catppuccin",
    light: {
      // Catppuccin Latte
      background:       "#eff1f5",
      foreground:       "#4c4f69",
      muted:            "#e6e9ef",
      mutedForeground:  "#6c6f85",
      border:           "#ccd0da",
      link:             "#1e66f5",
      linkHover:        "#4c4f69",
      codeBackground:   "#e6e9ef",
      surface:          "#eff1f5",
      surfaceHover:     "#dce0e8",
      primaryBtn:       "#1e66f5",
      primaryBtnText:   "#eff1f5",
      inputBorder:      "#ccd0da",
      inputFocusBorder: "#1e66f5",
      secondaryText:    "#6c6f85",
    },
    dark: {
      // Catppuccin Mocha
      background:       "#1e1e2e",
      foreground:       "#cdd6f4",
      muted:            "#181825",
      mutedForeground:  "#a6adc8",
      border:           "#45475a",
      link:             "#89b4fa",
      linkHover:        "#cdd6f4",
      codeBackground:   "#181825",
      surface:          "#1e1e2e",
      surfaceHover:     "#313244",
      primaryBtn:       "#89b4fa",
      primaryBtnText:   "#1e1e2e",
      inputBorder:      "#45475a",
      inputFocusBorder: "#89b4fa",
      secondaryText:    "#a6adc8",
    },
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
