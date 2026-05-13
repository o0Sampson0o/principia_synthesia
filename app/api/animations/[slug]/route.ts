import { db } from "@/db"
import { savedAnimations } from "@/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { defaultLight, defaultDark } from "@/lib/theme"
import type { ThemeTokens } from "@/db/schema"

/**
 * GET /api/animations/[slug]
 *
 * Serves the animation as a self-contained HTML page suitable for embedding in
 * an `<iframe>`. The page contains a full-screen `<canvas>`, an inline
 * `<script>` with the stored animation code, and a `window.theme` object
 * populated with the 15 color tokens.
 *
 * Theme tokens are read from the `?theme=` query parameter, which must be a
 * URL-encoded JSON string of the form `{ light: ThemeTokens, dark: ThemeTokens }`.
 * The iframe selects the correct set at runtime via a `prefers-color-scheme`
 * media query listener. If the parameter is absent or malformed, the built-in
 * default tokens are used as a fallback.
 *
 * The first function declaration found in the animation code is called
 * automatically after `DOMContentLoaded` (e.g. `function MyAnim() {...}` →
 * `MyAnim();`). Animation code that uses a top-level IIFE or event listeners
 * directly requires no named function.
 *
 * Returns 404 if no animation with the given slug exists in the database.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const anim = await db.select().from(savedAnimations).where(eq(savedAnimations.slug, slug)).limit(1)
  if (!anim[0]) return new NextResponse("Not found", { status: 404 })

  const fnMatch = anim[0].code.match(/function\s+(\w+)/)
  const fnCall = fnMatch ? `${fnMatch[1]}();` : ""

  // Read theme tokens from query param, fall back to defaults based on
  // prefers-color-scheme — the iframe has no access to the parent's CSS vars.
  const url = new URL(req.url)
  const raw = url.searchParams.get("theme")
  let light: ThemeTokens = defaultLight
  let dark: ThemeTokens = defaultDark
  if (raw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(raw))
      if (parsed.light) light = { ...defaultLight, ...parsed.light }
      if (parsed.dark)  dark  = { ...defaultDark,  ...parsed.dark }
    } catch {}
  }

  // Get CSP nonce from middleware-set header
  const nonce = req.headers.get("x-csp-nonce") ?? ""

  const html = `<!DOCTYPE html>
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
    // Theme tokens available to all animations as window.theme
    const _light = ${JSON.stringify(light)};
    const _dark  = ${JSON.stringify(dark)};
    const _dark_mq = window.matchMedia('(prefers-color-scheme: dark)');
    window.theme = _dark_mq.matches ? _dark : _light;
    _dark_mq.addEventListener('change', e => { window.theme = e.matches ? _dark : _light; });

    window.addEventListener('DOMContentLoaded', function() {
      ${anim[0].code}
      ${fnCall}
    });
  </script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  })
}

/**
 * DELETE /api/animations/[slug]
 *
 * Removes the animation record from the database. Returns `{ ok: true }` on
 * success regardless of whether the slug existed. No auth check is performed
 * here — the admin UI that calls this is already protected by middleware.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  await db.delete(savedAnimations).where(eq(savedAnimations.slug, slug))
  return NextResponse.json({ ok: true })
}
