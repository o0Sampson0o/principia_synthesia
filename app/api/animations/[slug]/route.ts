import { db } from "@/db"
import { savedAnimations } from "@/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const anim = await db.select().from(savedAnimations).where(eq(savedAnimations.slug, slug)).limit(1)
  if (!anim[0]) return new NextResponse("Not found", { status: 404 })

  const fnMatch = anim[0].code.match(/function\s+(\w+)/)
  const fnCall = fnMatch ? `${fnMatch[1]}();` : ""

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
  <script>
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  await db.delete(savedAnimations).where(eq(savedAnimations.slug, slug))
  return NextResponse.json({ ok: true })
}
