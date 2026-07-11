import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { authorizePublisherRequest } from "@/lib/api-v1";
import { computeContentHash, createArticleCore } from "@/lib/articles-write";
import { apiCreateArticleSchema } from "@/lib/validations";

/**
 * GET /api/v1/publishers/[publisher]/articles — list all (non-deleted)
 * articles with their contentHash so a sync client can detect remote changes
 * without downloading every body. Optional `?since=<ISO date>` filters by
 * updatedAt.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ publisher: string }> }
) {
  const { publisher } = await params;
  const auth = await authorizePublisherRequest(request, publisher);
  if (auth instanceof NextResponse) return auth;

  const since = new URL(request.url).searchParams.get("since");
  let sinceDate: Date | null = null;
  if (since) {
    sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
      return NextResponse.json({ error: "invalid_since" }, { status: 422 });
    }
  }

  const rows = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      summary: articles.summary,
      metadata: articles.metadata,
      isInternal: articles.isInternal,
      parentBookId: articles.parentBookId,
      updatedAt: articles.updatedAt,
      content: articles.content,
    })
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, auth.ownerType),
        eq(articles.ownerId, auth.ownerId),
        isNull(articles.deletedAt),
        ...(sinceDate ? [gt(articles.updatedAt, sinceDate)] : [])
      )
    )
    .orderBy(articles.slug);

  return NextResponse.json({
    articles: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      status: r.metadata?.status ?? "published",
      isInternal: r.isInternal,
      parentBookId: r.parentBookId,
      updatedAt: r.updatedAt,
      contentHash: computeContentHash(r.content ?? ""),
    })),
  });
}

/**
 * POST /api/v1/publishers/[publisher]/articles — create an article.
 * 201 with { id, slug, contentHash, updatedAt }; 409 when the slug is taken.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ publisher: string }> }
) {
  const { publisher } = await params;
  const auth = await authorizePublisherRequest(request, publisher);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = apiCreateArticleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  try {
    const result = await createArticleCore({
      actor: auth.session,
      ownerType: auth.ownerType,
      ownerId: auth.ownerId,
      publisherSlug: publisher,
      slug: parsed.data.slug,
      title: parsed.data.title,
      summary: parsed.data.summary,
      content: parsed.data.content,
    });

    revalidatePath(`/${publisher}`);
    revalidatePath(`/${publisher}/articles/${result.slug}`);

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr?.code === "23505" || pgErr?.message?.includes("duplicate key")) {
      return NextResponse.json({ error: "slug_exists" }, { status: 409 });
    }
    throw err;
  }
}
