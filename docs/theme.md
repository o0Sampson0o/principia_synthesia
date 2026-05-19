# Theme & Dark Mode

## Theme system

Theme tokens (15 color values × light/dark) are defined in `lib/theme.ts` with defaults and presets. The root layout (`app/layout.tsx`) injects a `<style>` block with CSS custom properties (e.g. `--background`, `--primary-btn`) derived from the user's saved theme (from `userThemes` table) or the defaults.

Tailwind utility classes beginning with `themed-` (e.g. `themed-btn-primary`, `themed-input`, `themed-surface`) are defined in `app/globals.css` using these CSS variables — they are not standard Tailwind tokens.

## No-flash dark mode

`buildThemeStyle()` in `lib/theme.ts` emits dark tokens under both:
- `@media (prefers-color-scheme: dark)`
- `html[data-theme="dark"] :root`

The root layout injects a tiny inline `<script>` before the first paint that reads a `color-scheme` cookie and sets `data-theme="dark"` on `<html>` synchronously — preventing a flash of wrong theme.

`saveColorSchemePreference()` in `app/settings/actions.ts` writes the preference to both the `userThemes` DB row and the `color-scheme` cookie.
