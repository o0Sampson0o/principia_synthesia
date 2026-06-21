import { requireSession } from "@/lib/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { markNotificationRead, markAllNotificationsRead } from "./actions";
import StaleDigestCard from "@/components/StaleDigestCard";

type Notification = typeof notifications.$inferSelect;

function notificationHref(n: Notification): string {
  const p = n.payload as Record<string, unknown>;
  if (n.type === "stale_articles_digest") return "/notifications";
  if (n.type === "article_forked") {
    return `/${p.forkerPublisherSlug}/articles/${p.originalSlug}`;
  }
  if (n.type === "article_cited") {
    return `/${p.citingPublisherSlug}/articles/${p.citingSlug}`;
  }
  if (n.type === "onboarding_example_article") {
    return `/${p.publisherSlug}/articles/${p.slug}`;
  }
  return "/";
}

function notificationLabel(n: Notification): string {
  const p = n.payload as Record<string, unknown>;
  if (n.type === "stale_articles_digest") {
    const count = p.count as number;
    return `${count} article${count === 1 ? "" : "s"} haven't been verified recently — review them`;
  }
  if (n.type === "article_forked") {
    return `Your article "${p.originalTitle}" was forked`;
  }
  if (n.type === "article_cited") {
    return `Your article "${p.citedSlug}" was cited in "${p.citingTitle}"`;
  }
  if (n.type === "onboarding_example_article") {
    return `Welcome! Your example article "${p.title}" is ready.`;
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
    <main className="max-w-4xl mx-auto px-5 py-10 sm:py-14">
      <div className="flex items-end justify-between mb-10 gap-4">
        <div>
          <p className="ps-eyebrow mb-1.5">Principia Synthesia</p>
          <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>Notifications</h1>
        </div>
        {unreadCount > 0 && (
          <form action={markAllNotificationsRead}>
            <button type="submit" className="themed-btn-ghost shrink-0" style={{ fontSize: "0.8125rem" }}>
              Mark all read
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
                {n.type === "stale_articles_digest" && !n.readAt && (
                  <StaleDigestCard
                    notificationId={n.id}
                    articles={(n.payload as Record<string, unknown>).articles as Array<{ articleId: number; slug: string; publisherSlug: string; title: string }>}
                  />
                )}
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
