import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  authorizePublisherRequest,
  getIfMatchHash,
  preconditionRequired,
} from "@/lib/api-v1";
import {
  ArticleConflictError,
  ArticleNotFoundError,
  computeContentHash,
  deleteArticleCore,
  updateArticleCore,
} from "@/lib/articles-write";
import { apiUpdateArticleSchema } from "@/lib/validations";
import { findArticleBySlug } from "@/lib/article-lookup";

/**
 * The article a `?book=`-qualified request refers to.
 *
 * Delegates to the shared resolver so the sync API and the web pages cannot
 * disagree about what a slug means. `undefined` covers both "no such article"
 * and "ambiguous" — sync clients get a 404 and must qualify with `?book=`
 * rather than have a slug resolved to an arbitrary section.
 */
async function findArticle(
  ownerType: "user" | "org",
  ownerId: number,
  slug: string,
  bookSlug?: string | null
) {
  const lookup = await findArticleBySlug({
    ownerType,
    ownerId,
    slug,
    bookSlug,
    excludeBinnedParent: true,
  });
  return lookup.kind === "found" ? lookup.article : undefined;
}

/** Reads the optional `?book=` scope off a request URL. */
function bookScope(request: Request): string | null {
  return new URL(request.url).searchParams.get("book");
}

function conflictResponse(err: ArticleConflictError): NextResponse {
  return NextResponse.json(
    {
      error: "conflict",
      remoteContentHash: err.remoteContentHash,
      remoteUpdatedAt: err.remoteUpdatedAt,
    },
    { status: 412 }
  );
}

/**
 * GET /api/v1/publishers/[publisher]/articles/[slug] — full article including
 * the raw MDX content. contentHash doubles as the ETag.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ publisher: string; slug: string }> }
) {
  const { publisher, slug } = await params;
  const auth = await authorizePublisherRequest(request, publisher);
  if (auth instanceof NextResponse) return auth;

  const article = await findArticle(auth.ownerType, auth.ownerId, slug, bookScope(request));
  if (!article) {
    return NextResponse.json({ error: "article_not_found" }, { status: 404 });
  }

  const contentHash = computeContentHash(article.content ?? "");
  return NextResponse.json(
    {
      id: article.id,
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      metadata: article.metadata,
      content: article.content ?? "",
      isInternal: article.isInternal,
      parentBookId: article.parentBookId,
      parentBookSlug: article.parentBookSlug,
      updatedAt: article.updatedAt,
      contentHash,
    },
    { headers: { ETag: `"${contentHash}"` } }
  );
}

/**
 * PUT /api/v1/publishers/[publisher]/articles/[slug] — update content (and
 * optionally title/summary). Requires If-Match with the base contentHash the
 * client pulled; a mismatch means someone edited remotely since → 412.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ publisher: string; slug: string }> }
) {
  const { publisher, slug } = await params;
  const auth = await authorizePublisherRequest(request, publisher);
  if (auth instanceof NextResponse) return auth;

  const baseHash = getIfMatchHash(request);
  if (!baseHash) return preconditionRequired();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = apiUpdateArticleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const article = await findArticle(auth.ownerType, auth.ownerId, slug, bookScope(request));
  if (!article) {
    return NextResponse.json({ error: "article_not_found" }, { status: 404 });
  }

  try {
    const result = await updateArticleCore({
      actor: auth.session,
      ownerType: auth.ownerType,
      ownerId: auth.ownerId,
      publisherSlug: publisher,
      id: article.id,
      slug: article.slug,
      title: parsed.data.title ?? article.title,
      summary: parsed.data.summary ?? article.summary ?? undefined,
      content: parsed.data.content,
      editNote: parsed.data.editNote || "Synced via API",
      expectedBaseHash: baseHash,
    });

    revalidatePath(`/${publisher}`);
    revalidatePath(`/${publisher}/articles/${slug}`);

    return NextResponse.json({
      contentHash: result.contentHash,
      updatedAt: result.updatedAt,
    });
  } catch (err: unknown) {
    if (err instanceof ArticleConflictError) return conflictResponse(err);
    if (err instanceof ArticleNotFoundError) {
      return NextResponse.json({ error: "article_not_found" }, { status: 404 });
    }
    throw err;
  }
}

/**
 * DELETE /api/v1/publishers/[publisher]/articles/[slug] — soft delete.
 * Same If-Match semantics as PUT so a stale client can't delete an article
 * that changed remotely.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ publisher: string; slug: string }> }
) {
  const { publisher, slug } = await params;
  const auth = await authorizePublisherRequest(request, publisher);
  if (auth instanceof NextResponse) return auth;

  const baseHash = getIfMatchHash(request);
  if (!baseHash) return preconditionRequired();

  const article = await findArticle(auth.ownerType, auth.ownerId, slug, bookScope(request));
  if (!article) {
    return NextResponse.json({ error: "article_not_found" }, { status: 404 });
  }

  try {
    await deleteArticleCore({
      ownerType: auth.ownerType,
      ownerId: auth.ownerId,
      id: article.id,
      expectedBaseHash: baseHash,
    });
  } catch (err: unknown) {
    if (err instanceof ArticleConflictError) return conflictResponse(err);
    if (err instanceof ArticleNotFoundError) {
      return NextResponse.json({ error: "article_not_found" }, { status: 404 });
    }
    throw err;
  }

  revalidatePath(`/${publisher}`);
  revalidatePath(`/${publisher}/articles/${slug}`);

  return new NextResponse(null, { status: 204 });
}
