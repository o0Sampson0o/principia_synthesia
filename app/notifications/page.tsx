import { requireSession } from "@/lib/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { markNotificationRead, markAllNotificationsRead } from "./actions";

type Notification = typeof notifications.$inferSelect;

function notificationHref(n: Notification): string {
  const p = n.payload as Record<string, unknown>;
  if (n.type === "stale_article") {
    return `/${p.publisherSlug}/articles/${p.slug}`;
  }
  if (n.type === "article_forked") {
    return `/${p.forkerPublisherSlug}/articles/${p.forkedArticleId}`;
  }
  if (n.type === "article_cited") {
    return `/${p.citingPublisherSlug}/articles/${p.citingSlug}`;
  }
  return "/";
}

function notificationLabel(n: Notification): string {
  const p = n.payload as Record<string, unknown>;
  if (n.type === "stale_article") {
    return `Article "${p.title}" may be out of date`;
  }
  if (n.type === "article_forked") {
    return `Your article "${p.originalTitle}" was forked`;
  }
  if (n.type === "article_cited") {
    return `Your article "${p.citedSlug}" was cited in "${p.citingTitle}"`;
  }
  return n.type;
}

export default async function NotificationsPage() {
  const session = await requireSession();

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, session.userId))
    .orderBy(desc(notifications.createdAt));

  const unreadCount = rows.filter((r) => !r.readAt).length;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold themed-heading">Notifications</h1>
        {unreadCount > 0 && (
          <form action={markAllNotificationsRead}>
            <button type="submit" className="themed-btn-ghost text-sm px-4 py-2">
              Mark all as read
            </button>
          </form>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="themed-muted">No notifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-4 p-4 themed-surface rounded-lg border themed-border ${n.readAt ? "opacity-60" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <Link href={notificationHref(n)} className="themed-link text-sm font-medium">
                  {notificationLabel(n)}
                </Link>
                <p className="text-xs themed-muted mt-0.5">
                  {new Date(n.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {n.readAt && " · Read"}
                </p>
              </div>
              {!n.readAt && (
                <form action={markNotificationRead}>
                  <input type="hidden" name="notificationId" value={n.id} />
                  <button type="submit" className="themed-btn-ghost text-xs px-3 py-1 shrink-0">
                    Mark read
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
