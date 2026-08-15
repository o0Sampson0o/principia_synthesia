/**
 * The animation iframe document — one builder, two callers.
 *
 * An animation runs inside a sandboxed iframe whose document is a full-screen
 * `<canvas>` plus an inline `<script>` holding the author's code. Two things
 * need that document:
 *
 * - `GET /api/publishers/[publisher]/animations/[slug]` serves it for a stored
 *   animation object (`<DynamicAnimation>`, the object page, the editor).
 * - `<InlineAnimation>` renders it as an iframe `srcdoc` for a ```animation
 *   fence inside an article, where the code has no object to be fetched from.
 *
 * Both go through here so an inline animation behaves exactly like a stored
 * one: same `window.theme`, same "call the first function declaration" rule,
 * same height message to the embedder.
 */
import { ANIMATION_HEIGHT_MESSAGE } from "@/lib/animation-dimensions";
import type { ThemeTokens } from "@/db/schema";

export interface AnimationDocumentOptions {
  /** The author's animation code. */
  code: string;
  /** Theme tokens exposed as `window.theme` in each colour scheme. */
  light: ThemeTokens;
  dark: ThemeTokens;
  /** Frame height reported to the embedder via `postMessage`. */
  height: number;
  /**
   * CSP nonce for the inline `<script>`. Required: `script-src` is
   * nonce-based, and a `srcdoc` iframe inherits its parent's policy, so an
   * un-nonced script is blocked in both callers.
   */
  nonce: string;
}

/**
 * Escapes `</script` so animation code containing that sequence (in a string
 * or a comment) cannot close the tag it is embedded in.
 */
function escapeScript(code: string): string {
  return code.replace(/<\/(script)/gi, "<\\/$1");
}

/** Builds the self-contained HTML document that runs one animation. */
export function buildAnimationDocument({
  code,
  light,
  dark,
  height,
  nonce,
}: AnimationDocumentOptions): string {
  // The convention documented in docs/animations.md: the first `function`
  // declaration is the entry point and is called once the DOM is ready.
  const fnMatch = code.match(/function\s+(\w+)/);
  const fnCall = fnMatch ? `${fnMatch[1]}();` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 100%; height: 100vh; overflow: hidden; background: transparent; display: flex; align-items: center; justify-content: center; }
    canvas { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script nonce="${nonce}">
    const _light = ${JSON.stringify(light)};
    const _dark  = ${JSON.stringify(dark)};
    const _dark_mq = window.matchMedia('(prefers-color-scheme: dark)');
    window.theme = _dark_mq.matches ? _dark : _light;
    _dark_mq.addEventListener('change', e => { window.theme = e.matches ? _dark : _light; });

    // Tell the embedder how tall this animation wants to be. The height lives on
    // the object, so no embedder needs its own query to size the frame.
    try {
      parent.postMessage({ type: ${JSON.stringify(ANIMATION_HEIGHT_MESSAGE)}, height: ${height} }, '*');
    } catch (e) {}

    window.addEventListener('DOMContentLoaded', function() {
      ${escapeScript(code)}
      ${fnCall}
    });
  </script>
</body>
</html>`;
}
