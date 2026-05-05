import { db } from "@/db";
import { savedAnimations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const result = await db
    .select({ code: savedAnimations.code })
    .from(savedAnimations)
    .where(eq(savedAnimations.slug, slug))
    .limit(1);

  if (!result[0]) {
    return new Response("Animation not found", { status: 404 });
  }

  // Return HTML page that runs the animation
  const code = result[0].code;
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; overflow: hidden; background: transparent; }
    canvas { display: block; }
  </style>
</head>
<body>
  <div id="container"></div>
  <script>
    ${code}
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
    
    function init() {
      try {
        if (typeof initAnimation === 'function') {
          initAnimation('container');
        }
      } catch(e) {
        console.error('Animation error:', e);
      }
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "public, max-age=31536000",
    },
  });
}
