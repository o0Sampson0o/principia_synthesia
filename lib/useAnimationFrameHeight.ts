"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  ANIMATION_HEIGHT_MESSAGE,
  DEFAULT_ANIMATION_HEIGHT,
  normalizeAnimationHeight,
} from "@/lib/animation-dimensions";

/**
 * The height an animation iframe has asked to be.
 *
 * Every animation document posts its height up on load (see
 * `lib/animation-document.ts`), so no embedder needs its own query to size the
 * frame. Shared by the two frames that can host one: `<AnimationFrame>` (a
 * stored object, loaded by URL) and `<InlineAnimationFrame>` (a ```animation
 * fence, loaded as `srcdoc`).
 *
 * @param frameRef  The iframe being listened to.
 * @param frameId   Changes when the frame loads a different animation.
 */
export function useAnimationFrameHeight(
  frameRef: RefObject<HTMLIFrameElement | null>,
  frameId: string
): number {
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
  }, [frameRef]);

  // A new animation reports its own height; drop back to the default meanwhile
  // so the previous animation's height doesn't linger on the new frame. Adjusted
  // during render rather than in an effect — no extra commit, no flash of the
  // stale height. https://react.dev/learn/you-might-not-need-an-effect
  const [renderedFrameId, setRenderedFrameId] = useState(frameId);
  if (renderedFrameId !== frameId) {
    setRenderedFrameId(frameId);
    setHeight(DEFAULT_ANIMATION_HEIGHT);
  }

  return height;
}
