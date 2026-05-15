import { NextResponse } from "next/server";

/**
 * GET /api/objects/[slug]/preview
 *
 * Permanently redirects (308) to the canonical animation iframe endpoint at
 * `/api/animations/[slug]`, preserving any query string (e.g. `?theme=`).
 *
 * All animation objects are now unified in the `objects` table under
 * `type = "animation"`, and `/api/animations/[slug]` is the single canonical
 * iframe endpoint. This redirect keeps any existing consumers of the old
 * `/api/objects/[slug]/preview` URL working without duplicating the HTML
 * generation logic.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const target = `/api/animations/${encodeURIComponent(slug)}${url.search}`;
  return NextResponse.redirect(new URL(target, url.origin), 308);
}
