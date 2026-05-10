"use client";

import { useState, useEffect } from "react";

const TOKEN_KEYS = [
  "background", "foreground", "muted", "mutedForeground", "border",
  "link", "linkHover", "codeBackground", "surface", "surfaceHover",
  "primaryBtn", "primaryBtnText", "inputBorder", "inputFocusBorder", "secondaryText",
] as const;

function camelToKebab(s: string) {
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
 * Builds the `src` URL for the animation iframe. Reads the current page's CSS
 * custom properties via `getComputedStyle` and encodes them as a `?theme=`
 * query parameter so the sandboxed iframe — which has no access to the parent
 * page's CSS — receives the correct color tokens via `window.theme`.
 *
 * An optional `version` number is appended as `&v=<n>` to bust the iframe
 * cache after the animation code is updated in the editor.
 *
 * Must be called in a browser context (reads `document.documentElement`).
 */
export function buildAnimationSrc(slug: string, version?: number): string {
  const tokens = readThemeTokens();
  const theme = encodeURIComponent(JSON.stringify({ light: tokens, dark: tokens }));
  const v = version !== undefined ? `&v=${version}` : "";
  return `/api/animations/${slug}?theme=${theme}${v}`;
}

/**
 * React hook that returns the iframe `src` URL for an animation, or `null`
 * before the component mounts (SSR-safe). The URL is recomputed whenever
 * `slug` or `version` changes.
 *
 * Internally calls `buildAnimationSrc` inside a `useEffect` so the DOM is
 * available when CSS variables are read.
 */
export function useAnimationSrc(slug: string, version?: number): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    setSrc(buildAnimationSrc(slug, version));
  }, [slug, version]);
  return src;
}
