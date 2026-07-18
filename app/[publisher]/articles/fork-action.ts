"use server";

import { db } from "@/db";
import { articles } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { resolvePublisher } from "@/lib/publisher";
import { canView } from "@/lib/access";
import { notify, resolveArticleAuthors, type ArticleForkedPayload } from "@/lib/notifications";
import { forkArticleSchema } from "@/lib/validations";
import { isUniqueViolation } from "@/lib/db-errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Generate a slug for the forked article that is unique within the forker's publisher.
 * Starts with `<source-slug>-fork`, then appends `-2`, `-3`, … up to 10 retries.
 */
async function generateForkSlug(
  baseSlug: string,
  ownerType: string,
  ownerId: number
): Promise<string | null> {
  const candidates = [
    `${baseSlug}-fork`,
    ...Array.from({ length: 9 }, (_, i) => `${baseSlug}-fork-${i + 2}`),
  ];

  for (const candidate of candidates) {
    const existing = await db
      .select({ id: articles.id })
      .from(articles)
      .where(
        and(
          eq(articles.ownerType, ownerType),
          eq(articles.ownerId, ownerId),
          eq(articles.slug, candidate)
        )
      )
      .limit(1);
    if (existing.length === 0) return candidate;
  }

  return null;
}

/**
 * Fork an article into the current user's own publisher account.
 *
 * Validates that the user can view the source article, creates a draft copy
 * with `forkedFromId` set, notifies the source article's author(s), and
 * redirects to the new article's edit page.
 */
export async function forkArticle(formData: FormData): Promise<{ error: string } | void> {
  const session = await requireSession();

  const raw = {
    sourcePublisherSlug: formData.get("sourcePublisherSlug"),
    sourceArticleSlug: formData.get("sourceArticleSlug"),
  };

  const validated = forkArticleSchema.safeParse(raw);
  if (!validated.success) throw new Error("Invalid fork request.");

  const { sourcePublisherSlug, sourceArticleSlug } = validated.data;

  // Resolve source publisher
  const sourcePub = await resolvePublisher(sourcePublisherSlug);
  if (!sourcePub) throw new Error("Source publisher not found.");

  const sourceOwnerType = sourcePub.kind;
  const sourceOwnerId = (sourcePub.kind === "user" ? sourcePub.userId : sourcePub.orgId)!;

  // Fetch source article (must not be soft-deleted)
  const [sourceArticle] = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, sourceOwnerType),
        eq(articles.ownerId, sourceOwnerId),
        eq(articles.slug, sourceArticleSlug),
        isNull(articles.deletedAt)
      )
    )
    .limit(1);

  if (!sourceArticle) throw new Error("Source article not found.");

  // Access check — forking requires the user to be able to view the article
  const canViewSource = await canView(
    { type: "article", ownerType: sourceOwnerType, ownerId: sourceOwnerId, slug: sourceArticleSlug },
    session
  );
  if (!canViewSource) throw new Error("Access denied.");

  // The fork target is always the user's personal publisher
  const forkerSlug = session.userSlug;
  const forkerPub = await resolvePublisher(forkerSlug);
  if (!forkerPub || forkerPub.kind !== "user" || forkerPub.userId === null) {
    throw new Error("Could not resolve forker's publisher.");
  }

  const targetOwnerType = "user";
  const targetOwnerId = forkerPub.userId;

  // Generate a unique slug
  const forkSlug = await generateForkSlug(sourceArticleSlug, targetOwnerType, targetOwnerId);
  if (forkSlug === null) {
    return { error: "You already have many forks of this article — delete one before forking again." };
  }

  // Derive forked metadata: reset status to draft, preserve tags/canvas
  const forkMetadata = {
    ...sourceArticle.metadata,
    status: "draft" as const,
  };

  // Insert the forked article
  let forked: { id: number; slug: string };
  try {
    [forked] = await db
      .insert(articles)
      .values({
      slug: forkSlug,
      title: sourceArticle.title,
      content: sourceArticle.content,
      summary: sourceArticle.summary,
      ownerType: targetOwnerType,
      ownerId: targetOwnerId,
      isInternal: false,
      metadata: forkMetadata,
      forkedFromId: sourceArticle.id,
      lastVerifiedAt: null,
    })
      .returning({ id: articles.id, slug: articles.slug });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Fork failed: a copy with this name already exists in your account." };
    }
    throw err;
  }

  // Notify the source article's author(s)
  const recipients = await resolveArticleAuthors(sourceOwnerType, sourceOwnerId);
  const payload: ArticleForkedPayload = {
    forkedArticleId: forked.id,
    forkerPublisherSlug: forkerSlug,
    originalSlug: sourceArticleSlug,
    originalTitle: sourceArticle.title,
  };
  await Promise.all(
    recipients.map((userId) => notify(userId, "article_forked", payload).catch(() => {}))
  );

  revalidatePath(`/${sourcePublisherSlug}/articles/${sourceArticleSlug}`);
  revalidatePath(`/${forkerSlug}`);

  redirect(`/${forkerSlug}/articles/${forkSlug}/edit`);
}
