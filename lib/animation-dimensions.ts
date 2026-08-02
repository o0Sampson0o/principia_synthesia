/**
 * Frame sizing for animation objects.
 *
 * The height is stored on the animation object itself (in the `content` jsonb,
 * alongside `code`) rather than passed per-embed, so one animation is the same
 * size everywhere it appears: article embeds, the object page, the editor
 * preview, and exported book bundles.
 *
 * Embedders never query for it. The iframe route already loads the object, so
 * it reports the height to the parent via `postMessage` on load — see
 * `components/AnimationFrame.tsx`.
 */

export const DEFAULT_ANIMATION_HEIGHT = 400;
export const MIN_ANIMATION_HEIGHT = 120;
export const MAX_ANIMATION_HEIGHT = 1600;

/** The `postMessage` type tag used to report a frame's height to its embedder. */
export const ANIMATION_HEIGHT_MESSAGE = "ps:animation-height";

/**
 * Coerces an untrusted height into a safe pixel value.
 * Non-numeric, non-finite, or out-of-range input falls back to the default
 * rather than throwing — a bad stored value must never break rendering.
 */
export function normalizeAnimationHeight(value: unknown): number {
  // Deliberately narrow before coercing: Number(""), Number(null), Number([])
  // and Number(true) are all finite, and would otherwise clamp to the minimum
  // instead of falling back — a cleared input must mean "default", not 120.
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.trim() !== "") n = Number(value);
  else return DEFAULT_ANIMATION_HEIGHT;

  if (!Number.isFinite(n)) return DEFAULT_ANIMATION_HEIGHT;
  const rounded = Math.round(n);
  if (rounded < MIN_ANIMATION_HEIGHT) return MIN_ANIMATION_HEIGHT;
  if (rounded > MAX_ANIMATION_HEIGHT) return MAX_ANIMATION_HEIGHT;
  return rounded;
}

/**
 * Reads the frame height out of an animation object's `content` jsonb.
 * Objects saved before heights existed have no `height` key and get the default.
 */
export function readAnimationHeight(content: unknown): number {
  if (!content || typeof content !== "object") return DEFAULT_ANIMATION_HEIGHT;
  return normalizeAnimationHeight((content as { height?: unknown }).height);
}
