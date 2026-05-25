"use server";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import {
  markNotificationReadSchema,
} from "@/lib/validations";
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
