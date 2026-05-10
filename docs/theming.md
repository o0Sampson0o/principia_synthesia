# Theme System

This document explains the per-user color theme system: the token model, how
themes are persisted and injected, how CSS utilities consume them, and how to
add new presets. Target audience: a developer extending or debugging the theme
system.

---

## Token model

A theme is made of **15 color tokens**, each expressed as a CSS color string
(hex, rgb, etc.). Every token maps to a CSS custom property on `:root`:

| Token (camelCase) | CSS custom property | Role |
|---|---|---|
| `background` | `--background` | Page background |
| `foreground` | `--foreground` | Primary body text |
| `muted` | `--muted` | Subdued background (sidebar, code blocks) |
| `mutedForeground` | `--muted-foreground` | Secondary text on muted backgrounds |
| `border` | `--border` | Borders and horizontal rules |
| `link` | `--link` | Hyperlink color |
| `linkHover` | `--link-hover` | Hyperlink hover color |
| `codeBackground` | `--code-background` | Inline and block code background |
| `surface` | `--surface` | Raised surfaces (nav bar, cards) |
| `surfaceHover` | `--surface-hover` | Hovered surface state |
| `primaryBtn` | `--primary-btn` | Primary button fill |
| `primaryBtnText` | `--primary-btn-text` | Text on primary buttons |
| `inputBorder` | `--input-border` | Form input borders |
| `inputFocusBorder` | `--input-focus-border` | Focused form input border |
| `secondaryText` | `--secondary-text` | Labels, section headers, nav links |

The `ThemeTokens` type in `db/schema.ts` is the canonical definition of these
15 fields.

A complete theme has **two** `ThemeTokens` objects: one for light mode and one
for dark mode.

---

## How themes are applied

### Root layout injection

`app/layout.tsx` runs on every request. It:

1. Calls `getSession()` to identify the logged-in user.
2. If the user has a row in `userThemes`, reads their `lightTokens` and
   `darkTokens`.
3. Calls `buildThemeStyle(light, dark)` from `lib/theme.ts` to generate a CSS
   string of the form:

   ```css
   :root {
     --background: #ffffff;
     --foreground: #18181b;
     /* ... 13 more tokens ... */
   }
   @media (prefers-color-scheme: dark) {
     :root {
       --background: #09090b;
       /* ... */
     }
   }
   ```

4. Injects this string as a `<style>` block inside `<head>`.

If the user has no saved theme, `defaultThemeStyle()` is used (the zinc-based
default defined in `lib/theme.ts`).

### `GET /api/themes/[slug]`

This route serves the same CSS for a given user's email as a `text/css`
response with `Cache-Control: no-store`. It is not currently used by the
application itself but is available for external tooling or stylesheets that
need to load the theme dynamically.

---

## Tailwind utility classes

`app/globals.css` defines a set of `themed-*` utility classes that map to the
CSS custom properties. These are **not** standard Tailwind tokens — they are
custom classes defined in the globals file. Examples:

- `themed-btn-primary` — uses `--primary-btn` / `--primary-btn-text`
- `themed-input` — uses `--input-border` / `--input-focus-border`
- `themed-surface` — uses `--surface`
- `themed-muted` — uses `--muted-foreground`
- `themed-border` — uses `--border`
- `themed-heading` — uses `--foreground`
- `themed-link` — uses `--link` / `--link-hover`
- `themed-secondary` — uses `--secondary-text`

Use these classes instead of hardcoded Tailwind color utilities (e.g.
`text-zinc-700`) so components respond to user-selected themes.

---

## Saving and resetting themes

Users with a valid session can edit their theme at `/settings/theme`. The
`ThemeEditor` component (a client component) lets the user:

1. Toggle between editing light and dark mode independently.
2. Apply a built-in preset (applies all 15 tokens at once).
3. Use color pickers to fine-tune individual tokens (changes are applied to
   CSS variables on `document.documentElement` in real time for instant preview).
4. Save the current mode's tokens via the `saveTheme` server action
   (`app/settings/actions.ts`), which upserts the `userThemes` row and
   revalidates the root layout.
5. Reset one mode to its default via `resetTheme`.

Themes are persisted as JSONB in the `userThemes` table with one row per user
(enforced by a unique constraint on `userId`).

---

## Built-in presets

`lib/theme.ts` exports a `PRESETS` array of `Preset` objects, each with a
`name`, `light`, and `dark` `ThemeTokens`. The current presets are:

- **Default** — zinc / neutral
- **Sepia** — warm parchment tones
- **Nord** — cool arctic blues and grays
- **Rosé Pine** — muted pink and purple
- **Solarized** — the classic Ethan Schoonover palette
- **Gruvbox** — earthy retro tones
- **Catppuccin** — Latte (light) / Mocha (dark)

### Adding a new preset

1. Open `lib/theme.ts`.
2. Add a new entry to the `PRESETS` array with a unique `name` and a full set
   of 15 hex values for both `light` and `dark`.

```ts
{
  name: "My Preset",
  light: {
    background:       "#f5f5f4",
    foreground:       "#1c1917",
    muted:            "#e7e5e4",
    mutedForeground:  "#78716c",
    border:           "#d6d3d1",
    link:             "#0c4a6e",
    linkHover:        "#1c1917",
    codeBackground:   "#e7e5e4",
    surface:          "#f5f5f4",
    surfaceHover:     "#e7e5e4",
    primaryBtn:       "#1c1917",
    primaryBtnText:   "#f5f5f4",
    inputBorder:      "#d6d3d1",
    inputFocusBorder: "#78716c",
    secondaryText:    "#78716c",
  },
  dark: {
    /* ... dark variants ... */
  },
},
```

No other changes are required. The preset will appear immediately in the theme
editor's preset picker.

---

## Animation theme forwarding

Because animation iframes are sandboxed (no access to the parent's CSS), the
`buildAnimationSrc()` function in `lib/useAnimationSrc.ts` reads all 15 CSS
custom properties via `getComputedStyle(document.documentElement)` and encodes
them as the `?theme=` query parameter. The API route injects them as
`window.theme` in the iframe's page script. See `docs/animations.md` for
details.
