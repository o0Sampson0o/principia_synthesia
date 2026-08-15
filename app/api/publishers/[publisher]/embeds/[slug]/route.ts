import { NextResponse } from "next/server";
import { resolveEmbed } from "@/lib/embed-resolve";

/**
 * GET /api/publishers/[publisher]/embeds/[slug]?publisher=…
 *
 * Resolves what an `<Embed slug="…" />` points at, as JSON.
 *
 * `[publisher]` in the path is the *default* publisher — the one a bare slug
 * resolves against, i.e. the embedding article's. The optional `?publisher=`
 * carries an explicit `publisher` prop, which overrides it. `[slug]` is the
 * target exactly as the author wrote it, including the `pub:objects:thing`
 * address form; interpreting it is `resolveEmbed`'s job alone.
 *
 * The published page resolves embeds on the server while rendering MDX; the
 * editor Preview cannot, because it renders to an HTML string with no React on
 * the server. It leaves a mount point instead and fills it from here, so both
 * paths end up rendering the same `<EmbedBody>` from the same data.
 *
 * Access is decided by `resolveEmbed`, which returns nothing for content the
 * caller may not see — so this 404s identically for private and non-existent
 * slugs.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ publisher: string; slug: string }> }
) {
  const { publisher, slug } = await params;
  const explicitPublisher = new URL(req.url).searchParams.get("publisher") ?? undefined;

  const embed = await resolveEmbed({
    slug,
    publisher: explicitPublisher,
    defaultPublisher: publisher,
  });
  if (!embed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(embed, {
    headers: { "cache-control": "no-store" },
  });
}
