import { db } from "@/db";
import { objects } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { defaultLight, defaultDark } from "@/lib/theme";
import type { ThemeTokens } from "@/db/schema";
import type { KaoContent } from "@/lib/kao";
import { isAnimationContent } from "@/lib/kao";

/**
 * GET /api/objects/[slug]/preview
 *
 * Serves a KAO animation object as a self-contained HTML page suitable for
 * embedding in an `<iframe>`. Only objects with type="animation" are served;
 * all others return 404.
 *
 * Identical in structure to `/api/animations/[slug]` but queries the `objects`
 * table instead of `savedAnimations` and extracts `code` from the JSONB content.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const rows = await db
    .select()
    .from(objects)
    .where(and(eq(objects.slug, slug), eq(objects.type, "animation")))
    .limit(1);

  if (!rows[0]) return new NextResponse("Not found", { status: 404 });

  const content = rows[0].content as KaoContent;
  if (!isAnimationContent(content)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const code = content.code;
  const fnMatch = code.match(/function\s+(\w+)/);
  const fnCall = fnMatch ? `${fnMatch[1]}();` : "";

  const url = new URL(req.url);
  const raw = url.searchParams.get("theme");
  let light: ThemeTokens = defaultLight;
  let dark: ThemeTokens = defaultDark;
  if (raw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(raw));
      if (parsed.light) light = { ...defaultLight, ...parsed.light };
      if (parsed.dark)  dark  = { ...defaultDark,  ...parsed.dark };
    } catch {}
  }

  const nonce = req.headers.get("x-csp-nonce") ?? "";

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
    const _light = ${JSON.stringify(light)};
    const _dark  = ${JSON.stringify(dark)};
    const _dark_mq = window.matchMedia('(prefers-color-scheme: dark)');
    window.theme = _dark_mq.matches ? _dark : _light;
    _dark_mq.addEventListener('change', e => { window.theme = e.matches ? _dark : _light; });

    window.addEventListener('DOMContentLoaded', function() {
      ${code}
      ${fnCall}
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
