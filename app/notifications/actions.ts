"use server";

import { db } from "@/db";
import { articles, notifications } from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { markNotificationReadSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";

/**
 * Mark a single notification as read. Only the notification's owner can call this.
 */
export async function markNotificationRead(formData: FormData): Promise<void> {
  const session = await requireSession();

  const validated = markNotificationReadSchema.parse({
    notificationId: formData.get("notificationId"),
  });

  const [row] = await db
    .select({ id: notifications.id, userId: notifications.userId })
    .from(notifications)
    .where(eq(notifications.id, validated.notificationId))
    .limit(1);

  if (!row || row.userId !== session.userId) {
    throw new Error("Forbidden");
  }

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, validated.notificationId));

  revalidatePath("/notifications");
}

/**
 * Mark all of the current user's unread notifications as read.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const session = await requireSession();

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, session.userId),
        isNull(notifications.readAt)
      )
    );

  revalidatePath("/notifications");
}

/**
 * Mark `last_verified_at = NOW()` for a batch of article IDs submitted via
 * checkboxes (name="articleId", multiple values). Only updates articles the
 * current user actually owns — either directly or as an org admin — so
 * arbitrary IDs in the form data are safely ignored.
 *
 * Also marks the originating notification as read if `notificationId` is present.
 */
export async function bulkVerifyArticles(formData: FormData): Promise<void> {
  const session = await requireSession();

  const ids = formData
    .getAll("articleId")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (ids.length === 0) return;

  await db
    .update(articles)
    .set({ lastVerifiedAt: new Date() })
    .where(
      and(
        inArray(articles.id, ids),
        sql`(
          (${articles.ownerType} = 'user' AND ${articles.ownerId} = ${session.userId})
          OR EXISTS (
            SELECT 1 FROM org_memberships om
            WHERE om.org_id = ${articles.ownerId}
              AND ${articles.ownerType} = 'org'
              AND om.user_id = ${session.userId}
              AND om.role IN ('admin', 'super_admin')
          )
        )`
      )
    );

  const notificationId = Number(formData.get("notificationId"));
  if (Number.isInteger(notificationId) && notificationId > 0) {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, session.userId)
        )
      );
  }

  revalidatePath("/notifications");
}
