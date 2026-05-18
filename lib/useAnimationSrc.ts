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
  const tokens = readThemeTokens();
  const theme = encodeURIComponent(JSON.stringify({ light: tokens, dark: tokens }));
  const v = version !== undefined ? `&v=${version}` : "";
  return `/api/publishers/${publisher}/animations/${slug}?theme=${theme}${v}`;
}

/**
 * React hook that returns the iframe `src` URL for an animation, or `null`
 * before the component mounts (SSR-safe). The URL is recomputed whenever
 * `publisher`, `slug`, or `version` changes.
 */
export function useAnimationSrc(
  publisher: string,
  slug: string,
  version?: number
): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(buildAnimationSrc(publisher, slug, version));
  }, [publisher, slug, version]);

  return src;
}
