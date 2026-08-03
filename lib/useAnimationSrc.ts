"use client";

import { useState, useEffect } from "react";

/**
 * The theme tokens forwarded into the animation iframe as `window.theme.*`.
 * This is the authoritative list — the editor's colour reference is derived
 * from it so the two cannot drift apart.
 */
export const ANIMATION_THEME_TOKENS = [
  "background", "foreground", "muted", "mutedForeground", "border",
  "accent", "accentForeground", "link", "linkHover", "codeBackground",
  "surface", "surfaceHover", "primaryBtn", "primaryBtnText", "inputBorder",
  "inputFocusBorder", "secondaryText",
] as const;

export type AnimationThemeToken = (typeof ANIMATION_THEME_TOKENS)[number];

const TOKEN_KEYS = ANIMATION_THEME_TOKENS;

/** `mutedForeground` → `muted-foreground`, matching the CSS custom property name. */
export function camelToKebab(s: string) {
  return s.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

function readThemeTokens() {
  const style = getComputedStyle(document.documentElement);
  const result: Record<string, string> = {};
  for (const key of TOKEN_KEYS) {
    result[key] = style.getPropertyValue(`--${camelToKebab(key)}`).trim();
  }
  return result;
}

/**
 * Builds the `src` URL for the animation iframe.
 * Reads the current page's CSS custom properties via `getComputedStyle` and
 * encodes them as a `?theme=` query parameter so the sandboxed iframe receives
 * the correct color tokens via `window.theme`.
 *
 * @param publisher - The publisher slug that owns the animation object.
 * @param slug      - The animation object slug (must start with `anim-`).
 * @param version   - Optional cache-busting version number.
 */
export function buildAnimationSrc(publisher: string, slug: string, version?: number): string {
  // Both sets carry the same values: `getComputedStyle` can only report the
  // scheme that is currently active. `useAnimationSrc` rebuilds this URL when
  // the scheme changes, which is what actually keeps the animation in step.
  const tokens = readThemeTokens();
  const theme = encodeURIComponent(JSON.stringify({ light: tokens, dark: tokens }));
  const v = version !== undefined ? `&v=${version}` : "";
  return `/api/publishers/${publisher}/animations/${slug}?theme=${theme}${v}`;
}

/**
 * React hook that returns the iframe `src` URL for an animation, or `null`
 * before the component mounts (SSR-safe). The URL is recomputed whenever
 * `publisher`, `slug` or `version` changes, and whenever the viewer switches
 * between light and dark.
 *
 * The scheme listener is what makes the colours actually follow the theme.
 * `getComputedStyle` only ever reports the *currently active* set — the dark
 * values live behind a `@media (prefers-color-scheme: dark)` block and are not
 * readable while light is active — so the URL is built from whichever set is
 * live at the time. Without rebuilding on change, a viewer toggling their OS
 * theme would keep the old palette until the next navigation.
 */
export function useAnimationSrc(
  publisher: string,
  slug: string,
  version?: number
): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const rebuild = () => setSrc(buildAnimationSrc(publisher, slug, version));
    rebuild();

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", rebuild);
    return () => mq.removeEventListener("change", rebuild);
  }, [publisher, slug, version]);

  return src;
}
