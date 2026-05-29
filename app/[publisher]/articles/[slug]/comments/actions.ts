"use server";

import { db } from "@/db";
import { articles, articleComments, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { resolvePublisher } from "@/lib/publisher";
import { canView } from "@/lib/access";
import { canEditContent } from "@/lib/roles";
import { createCommentSchema, deleteCommentSchema, editCommentSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveArticle(publisherSlug: string, slug: string) {
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) throw new Error("Publisher not found");

  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const [article] = await db
    .select({ id: articles.id, ownerType: articles.ownerType, ownerId: articles.ownerId })
    .from(articles)
    .where(
      and(
        eq(articles.slug, slug),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        isNull(articles.deletedAt)
      )
    )
    .limit(1);

  if (!article) throw new Error("Article not found");
  return { pub, article };
}

function articlePath(publisherSlug: string, slug: string) {
  return `/${publisherSlug}/articles/${slug}`;
}

// ---------------------------------------------------------------------------
// createComment
// ---------------------------------------------------------------------------

/**
 * Post a new comment (or reply) on an article.
 * Requires a session. The article must be visible to the session.
 */
export async function createComment(
  publisherSlug: string,
  slug: string,
  formData: FormData
): Promise<void> {
  const session = await requireSession();

  const validated = createCommentSchema.parse({
    articleId: formData.get("articleId"),
    parentId: formData.get("parentId") ?? undefined,
    body: formData.get("body"),
  });

  const { pub, article } = await resolveArticle(publisherSlug, slug);
  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  // Confirm the article is visible to the commenter
  const visible = await canView(
    { type: "article", ownerType: ownerType as "user" | "org", ownerId, slug },
    session
  );
  if (!visible) throw new Error("Forbidden");

  // articleId in form must match the resolved article
  if (validated.articleId !== article.id) throw new Error("Article ID mismatch");

  // If replying, verify the parent comment belongs to the same article
  if (validated.parentId !== undefined) {
    const [parent] = await db
      .select({ id: articleComments.id })
      .from(articleComments)
      .where(
        and(
          eq(articleComments.id, validated.parentId),
          eq(articleComments.articleId, article.id),
          isNull(articleComments.deletedAt)
        )
      )
      .limit(1);
    if (!parent) throw new Error("Parent comment not found");
  }

  await db.insert(articleComments).values({
    articleId: article.id,
    authorId: session.userId,
    parentId: validated.parentId ?? null,
    body: validated.body,
  });

  revalidatePath(articlePath(publisherSlug, slug));
}

// ---------------------------------------------------------------------------
// deleteComment
// ---------------------------------------------------------------------------

/**
 * Soft-delete a comment.
 * Only the comment author or a publisher editor may delete.
 */
export async function deleteComment(
  publisherSlug: string,
  slug: string,
  formData: FormData
): Promise<void> {
  const session = await requireSession();

  const validated = deleteCommentSchema.parse({
    commentId: formData.get("commentId"),
    articleId: formData.get("articleId"),
  });

  const { pub, article } = await resolveArticle(publisherSlug, slug);

  if (validated.articleId !== article.id) throw new Error("Article ID mismatch");

  const [comment] = await db
    .select({ id: articleComments.id, authorId: articleComments.authorId })
    .from(articleComments)
    .where(
      and(
        eq(articleComments.id, validated.commentId),
        eq(articleComments.articleId, article.id),
        isNull(articleComments.deletedAt)
      )
    )
    .limit(1);

  if (!comment) throw new Error("Comment not found");

  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const isAuthor = comment.authorId === session.userId;
  const isEditor = await canEditContent(session, ownerType as "user" | "org", ownerId);

  if (!isAuthor && !isEditor) throw new Error("Forbidden");

  await db
    .update(articleComments)
    .set({ deletedAt: new Date() })
    .where(eq(articleComments.id, comment.id));

  revalidatePath(articlePath(publisherSlug, slug));
}

// ---------------------------------------------------------------------------
// editComment
// ---------------------------------------------------------------------------

/**
 * Edit the body of a comment. Only the comment author may edit.
 */
export async function editComment(
  publisherSlug: string,
  slug: string,
  formData: FormData
): Promise<void> {
  const session = await requireSession();

  const validated = editCommentSchema.parse({
    commentId: formData.get("commentId"),
    articleId: formData.get("articleId"),
    body: formData.get("body"),
  });

  const { article } = await resolveArticle(publisherSlug, slug);

  if (validated.articleId !== article.id) throw new Error("Article ID mismatch");

  const [comment] = await db
    .select({ id: articleComments.id, authorId: articleComments.authorId })
    .from(articleComments)
    .where(
      and(
        eq(articleComments.id, validated.commentId),
        eq(articleComments.articleId, article.id),
        isNull(articleComments.deletedAt)
      )
    )
    .limit(1);

  if (!comment) throw new Error("Comment not found");
  if (comment.authorId !== session.userId) throw new Error("Forbidden");

  await db
    .update(articleComments)
    .set({ body: validated.body, updatedAt: new Date() })
    .where(eq(articleComments.id, comment.id));

  revalidatePath(articlePath(publisherSlug, slug));
}
