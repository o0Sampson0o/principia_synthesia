"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

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

export default function DynamicAnimation({ slug }: { slug: string }) {
  const [error, setError] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const tokens = readThemeTokens();
    const theme = encodeURIComponent(JSON.stringify({ light: tokens, dark: tokens }));
    setSrc(`/api/animations/${slug}?theme=${theme}`);
  }, [slug]);

  if (error) {
    return (
      <div className="my-6 p-4 border border-red-200 rounded text-red-500 text-sm">
        Failed to load animation: {slug}
      </div>
    );
  }

  return (
    <div className="my-6">
      {src && (
        <iframe
          src={src}
          className="w-full border-0"
          style={{ height: '400px' }}
          title={`Animation: ${slug}`}
          onError={() => setError(true)}
        />
      )}
      <div className="mt-2 text-right">
        <Link
          href={`/animations/${slug}`}
          className="text-xs text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
        >
          View animation →
        </Link>
      </div>
    </div>
  );
}
