"use client";

import { useRef } from "react";
import { useAnimationSrc } from "@/lib/useAnimationSrc";
import { useAnimationFrameHeight } from "@/lib/useAnimationFrameHeight";

interface Props {
  publisher: string;
  slug: string;
  /** Cache-busting version, used by the editor to refresh after a save. */
  version?: number;
  /** Extra classes for the iframe itself. */
  className?: string;
  /** Caps the reported height — for cramped contexts like the editor side panel. */
  maxHeight?: number;
  onError?: () => void;
}

/**
 * The embed point for a *stored* animation object's iframe.
 *
 * Height comes from the animation object, not from the embedder: the iframe
 * route posts the stored height up on load and this component applies it. Until
 * that message arrives (or if the frame's script never runs) the default height
 * is used, so the frame is never zero-height.
 *
 * An animation written inline in an article (a ```animation fence) has no
 * object to load from and is rendered by `<InlineAnimationFrame>` instead —
 * same document, same sizing, delivered as `srcdoc`.
 */
export default function AnimationFrame({
  publisher,
  slug,
  version,
  className = "",
  maxHeight,
  onError,
}: Props) {
  const src = useAnimationSrc(publisher, slug, version);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const height = useAnimationFrameHeight(frameRef, `${publisher}/${slug}/${version ?? ""}`);

  if (!src) return null;

  return (
    <iframe
      ref={frameRef}
      src={src}
      sandbox="allow-scripts"
      className={className}
      style={{ height: maxHeight ? Math.min(height, maxHeight) : height }}
      title={`Animation: ${slug}`}
      onError={onError}
    />
  );
}
