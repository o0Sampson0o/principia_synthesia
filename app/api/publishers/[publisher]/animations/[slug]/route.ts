import { db } from "@/db";
import { objects, publishers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { defaultLight, defaultDark } from "@/lib/theme";
import type { ThemeTokens } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { readAnimationHeight } from "@/lib/animation-dimensions";
import { buildAnimationDocument } from "@/lib/animation-document";

/**
 * GET /api/publishers/[publisher]/animations/[slug]
 *
 * Serves the animation as a self-contained HTML page suitable for embedding in
 * an `<iframe>`. The page contains a full-screen `<canvas>`, an inline
 * `<script>` with the stored animation code, and a `window.theme` object
 * populated with all 17 color tokens.
 *
 * Theme tokens are read from the `?theme=` query parameter, which must be a
 * URL-encoded JSON string of the form `{ light: ThemeTokens, dark: ThemeTokens }`.
 * If absent or malformed, built-in defaults are used as a fallback.
 *
 * Returns 404 if the publisher or animation does not exist.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ publisher: string; slug: string }> }
) {
  const { publisher: publisherSlug, slug } = await params;

  // Resolve publisher to ownerType + ownerId
  const [pubRow] = await db
    .select({
      kind: publishers.kind,
      userId: publishers.userId,
      orgId: publishers.orgId,
    })
    .from(publishers)
    .where(eq(publishers.slug, publisherSlug))
    .limit(1);

  if (!pubRow) return new NextResponse("Not found", { status: 404 });

  const ownerType = pubRow.kind === "user" ? "user" : "org";
  const ownerId = (pubRow.kind === "user" ? pubRow.userId : pubRow.orgId)!;

  const [row] = await db
    .select()
    .from(objects)
    .where(
      and(
        eq(objects.slug, slug),
        eq(objects.type, "animation"),
        eq(objects.ownerType, ownerType),
        eq(objects.ownerId, ownerId)
      )
    )
    .limit(1);

  if (!row) return new NextResponse("Not found", { status: 404 });

  const session = await getSession();
  const ok = await canView(
    { type: "object", ownerType, ownerId, slug },
    session
  );
  if (!ok) return new NextResponse("Not found", { status: 404 });

  const content = row.content as { code?: string };
  const code = content.code ?? "";
  if (!code) return new NextResponse("Not found", { status: 404 });

  const height = readAnimationHeight(row.content);

  const url = new URL(req.url);
  const raw = url.searchParams.get("theme");
  let light: ThemeTokens = defaultLight;
  let dark: ThemeTokens = defaultDark;
  if (raw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(raw));
      if (parsed.light) light = { ...defaultLight, ...parsed.light };
      if (parsed.dark) dark = { ...defaultDark, ...parsed.dark };
    } catch {
      // fall back to defaults
    }
  }

  const nonce = req.headers.get("x-csp-nonce") ?? "";

  const html = buildAnimationDocument({ code, light, dark, height, nonce });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
