"use client";

import { useState, useEffect } from "react";
import { camel2kebab, defaultLight } from "@/lib/theme";
import type { ThemeTokens } from "@/db/schema";

/**
 * The theme tokens forwarded into the animation iframe as `window.theme.*`.
 *
 * Derived from `defaultLight` rather than hand-listed, so a token added to
 * `ThemeTokens` reaches animation code automatically. It used to be a separate
 * list and silently drifted — `accent` and `accentForeground` existed in the
 * theme but never reached `window.theme`.
 */
export const ANIMATION_THEME_TOKENS = Object.keys(defaultLight) as AnimationThemeToken[];

export type AnimationThemeToken = keyof ThemeTokens;

function readThemeTokens() {
  const style = getComputedStyle(document.documentElement);
  const result: Record<string, string> = {};
  for (const key of ANIMATION_THEME_TOKENS) {
    result[key] = style.getPropertyValue(`--${camel2kebab(key)}`).trim();
  }
  return result;
}

/**
 * The theme tokens an animation frame should be given, read from the live page.
 *
 * `null` until mount (there is no `getComputedStyle` on the server), and
 * rebuilt whenever the viewer switches colour scheme — the same contract as
 * `useAnimationSrc`, which is the URL-shaped version of this. Inline animations
 * (`<InlineAnimation>`) have no URL to encode tokens into, so they read them
 * here and pass them straight to `buildAnimationDocument`.
 *
 * Both sets carry the same values for the same reason as `buildAnimationSrc`:
 * `getComputedStyle` can only report the scheme that is currently active.
 */
export function useAnimationThemeTokens(): { light: ThemeTokens; dark: ThemeTokens } | null {
  const [tokens, setTokens] = useState<{ light: ThemeTokens; dark: ThemeTokens } | null>(null);

  useEffect(() => {
    const rebuild = () => {
      const read = readThemeTokens() as unknown as ThemeTokens;
      setTokens({ light: read, dark: read });
    };
    rebuild();

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", rebuild);
    return () => mq.removeEventListener("change", rebuild);
  }, []);

  return tokens;
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
