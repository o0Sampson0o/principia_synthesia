import { db } from "@/db";
import { events, eventArticles } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function RelatedEvents({
  articleId,
  publisherSlug,
}: {
  articleId: number;
  publisherSlug: string;
}) {
  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      eventDate: events.eventDate,
      category: events.category,
    })
    .from(events)
    .innerJoin(eventArticles, eq(eventArticles.eventId, events.id))
    .where(eq(eventArticles.articleId, articleId))
    .orderBy(events.eventDate)
    .limit(5);

  if (rows.length === 0) return null;

  return (
    <section className="mt-10 pt-8 border-t themed-border">
      <h2 className="text-lg font-semibold themed-heading mb-4">Related events</h2>
      <ul className="space-y-3">
        {rows.map((e) => (
          <li key={e.id} className="space-y-0.5">
            <Link
              href={`/${publisherSlug}/events/${e.slug}`}
              className="themed-link font-medium block"
            >
              {e.title}
            </Link>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs themed-muted">
                {new Date(e.eventDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {e.category && (
                <span className="text-xs px-2 py-0.5 rounded-full themed-surface border themed-border themed-secondary">
                  {e.category}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
