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

export function buildAnimationSrc(slug: string, version?: number): string {
  const tokens = readThemeTokens();
  const theme = encodeURIComponent(JSON.stringify({ light: tokens, dark: tokens }));
  const v = version !== undefined ? `&v=${version}` : "";
  return `/api/animations/${slug}?theme=${theme}${v}`;
}

export function useAnimationSrc(slug: string, version?: number): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    setSrc(buildAnimationSrc(slug, version));
  }, [slug, version]);
  return src;
}
