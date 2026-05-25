import { db } from "@/db";
import { notifications, orgMemberships } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | "stale_articles_digest"
  | "article_forked"
  | "article_cited"
  | "onboarding_example_article";

export type StaleArticleItem = {
  articleId: number;
  slug: string;
  publisherSlug: string;
  title: string;
};

export type StaleArticlesDigestPayload = {
  articles: StaleArticleItem[];
  count: number;
};

export type ArticleForkedPayload = {
  forkedArticleId: number;
  forkerPublisherSlug: string;
  originalSlug: string;
  originalTitle: string;
};

export type ArticleCitedPayload = {
  citingArticleId: number;
  citingPublisherSlug: string;
  citingSlug: string;
  citingTitle: string;
  citedSlug: string;
};

export type OnboardingExampleArticlePayload = {
  articleId: number;
  publisherSlug: string;
  slug: string;
  title: string;
};

export type NotificationPayload =
  | StaleArticlesDigestPayload
  | ArticleForkedPayload
  | ArticleCitedPayload
  | OnboardingExampleArticlePayload;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve notification recipients for an article owner.
 * User-owned article → [ownerUserId].
 * Org-owned article  → super_admin + admin userIds of that org.
 */
export async function resolveArticleAuthors(
  ownerType: string,
  ownerId: number
): Promise<number[]> {
  if (ownerType === "user") return [ownerId];
  const members = await db
    .select({ userId: orgMemberships.userId })
    .from(orgMemberships)
    .where(
      sql`${orgMemberships.orgId} = ${ownerId} AND ${orgMemberships.role} IN ('super_admin', 'admin')`
    );
  return members.map((m) => m.userId);
}

/**
 * Insert a notification row for `userId`. No deduplication.
 * Features 5 and 6 call this directly — every fork/citation is a discrete event.
 */
export async function notify(
  userId: number,
  type: NotificationType,
  payload: NotificationPayload
): Promise<void> {
  await db.insert(notifications).values({
    userId,
    type,
    payload: payload as Record<string, unknown>,
  });
}

/**
 * Insert a notification only when no unread notification with the same `type`
 * and matching deduplication key already exists for this user.
 *
 * The cron (`check-stale-articles`) uses this so that a user is not spammed
 * with repeated stale-article nudges until they read the first one.
 */
export async function notifyWithDedupe(
  userId: number,
  type: NotificationType,
  payload: NotificationPayload,
  dedupeKey: (p: NotificationPayload) => string
): Promise<void> {
  const key = dedupeKey(payload);

  // Fetch existing unread notifications of this type for this user
  const existing = await db
    .select({ id: notifications.id, payload: notifications.payload })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, type),
        isNull(notifications.readAt)
      )
    );

  // Check if any existing notification matches the dedupe key
  for (const row of existing) {
    if (dedupeKey(row.payload as NotificationPayload) === key) {
      return; // already notified; skip
    }
  }

  await notify(userId, type, payload);
}

/**
 * Upsert a digest notification: if an unread notification of this type already
 * exists for the user, update its payload in-place. Otherwise insert a new row.
 * Used by the stale-articles cron so authors get one summary instead of N individual nudges.
 */
export async function notifyDigest(
  userId: number,
  type: NotificationType,
  payload: NotificationPayload
): Promise<void> {
  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, type),
        isNull(notifications.readAt)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(notifications)
      .set({ payload: payload as Record<string, unknown>, createdAt: sql`NOW()` })
      .where(eq(notifications.id, existing.id));
  } else {
    await notify(userId, type, payload);
  }
}
