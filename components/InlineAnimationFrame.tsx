"use client";

import { useRef } from "react";
import { useAnimationThemeTokens } from "@/lib/useAnimationSrc";
import { useAnimationFrameHeight } from "@/lib/useAnimationFrameHeight";
import { buildAnimationDocument } from "@/lib/animation-document";
import { readCspNonce } from "@/lib/csp-nonce";
import { normalizeAnimationHeight } from "@/lib/animation-dimensions";

interface Props {
  /** The animation code, written inline in the article. */
  code: string;
  /** Frame height, from the fence's `height=` meta. */
  height?: number;
  className?: string;
  maxHeight?: number;
}

/**
 * The embed point for an animation written inline in an article.
 *
 * Same document and same sandbox as `<AnimationFrame>` — the difference is only
 * how it is delivered. A stored animation is fetched from its API route by URL;
 * inline code has no object to fetch, so the document is built here and handed
 * to the iframe as `srcdoc`. A `srcdoc` frame inherits this page's CSP, which
 * is why its inline script carries the page nonce.
 */
export default function InlineAnimationFrame({ code, height, className = "", maxHeight }: Props) {
  const theme = useAnimationThemeTokens();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const reportedHeight = useAnimationFrameHeight(frameRef, code);

  // Built on the client, like the stored-animation URL: `getComputedStyle` is
  // what resolves the publisher's live theme tokens, and the nonce is only
  // readable from the rendered document.
  const srcDoc = theme
    ? buildAnimationDocument({
        code,
        light: theme.light,
        dark: theme.dark,
        height: normalizeAnimationHeight(height),
        nonce: readCspNonce(),
      })
    : null;

  if (!srcDoc) return null;

  return (
    <iframe
      ref={frameRef}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      className={className}
      style={{ height: maxHeight ? Math.min(reportedHeight, maxHeight) : reportedHeight }}
      title="Animation"
    />
  );
}
