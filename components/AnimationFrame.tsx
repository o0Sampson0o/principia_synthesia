"use client";

import { useEffect, useRef, useState } from "react";
import { useAnimationSrc } from "@/lib/useAnimationSrc";
import {
  ANIMATION_HEIGHT_MESSAGE,
  DEFAULT_ANIMATION_HEIGHT,
  normalizeAnimationHeight,
} from "@/lib/animation-dimensions";

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
 * The single embed point for an animation iframe.
 *
 * Height comes from the animation object, not from the embedder: the iframe
 * route posts the stored height up on load and this component applies it. Until
 * that message arrives (or if the frame's script never runs) the default height
 * is used, so the frame is never zero-height.
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
  const [height, setHeight] = useState(DEFAULT_ANIMATION_HEIGHT);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // The frame is sandboxed without allow-same-origin, so its origin is the
      // opaque "null" and can't be compared. Identify it by window instead —
      // this rejects messages from any other frame or extension on the page.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== ANIMATION_HEIGHT_MESSAGE) return;
      setHeight(normalizeAnimationHeight(data.height));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // A new animation reports its own height; drop back to the default meanwhile
  // so the previous animation's height doesn't linger on the new frame. Adjusted
  // during render rather than in an effect — no extra commit, no flash of the
  // stale height. https://react.dev/learn/you-might-not-need-an-effect
  const frameId = `${publisher}/${slug}/${version ?? ""}`;
  const [renderedFrameId, setRenderedFrameId] = useState(frameId);
  if (renderedFrameId !== frameId) {
    setRenderedFrameId(frameId);
    setHeight(DEFAULT_ANIMATION_HEIGHT);
  }

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
