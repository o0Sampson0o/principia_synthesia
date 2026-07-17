import { db } from "@/db";
import { formatDate } from "@/lib/format-date";
import { events, eventArticles, publishers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import SectionHeader from "./SectionHeader";

export default async function RelatedEvents({
  articleId,
}: {
  articleId: number;
  publisherSlug?: string;
}) {
  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      eventDate: events.eventDate,
      category: events.category,
      publisherSlug: publishers.slug,
    })
    .from(events)
    .innerJoin(eventArticles, eq(eventArticles.eventId, events.id))
    .innerJoin(
      publishers,
      sql`(
        (${events.ownerType} = 'user' AND ${publishers.userId} = ${events.ownerId} AND ${publishers.kind} = 'user')
        OR
        (${events.ownerType} = 'org' AND ${publishers.orgId} = ${events.ownerId} AND ${publishers.kind} = 'org')
      )`
    )
    .where(eq(eventArticles.articleId, articleId))
    .orderBy(events.eventDate)
    .limit(5);

  if (rows.length === 0) return null;

  return (
    <section className="mt-16">
      <SectionHeader
        title="Related events"
        count={`${rows.length} ${rows.length === 1 ? "event" : "events"}`}
      />
      <ul className="space-y-3 mt-4">
        {rows.map((e) => (
          <li key={e.id} className="space-y-0.5">
            <Link
              href={`/${e.publisherSlug}/events/${e.slug}`}
              className="themed-link font-medium block"
            >
              {e.title}
            </Link>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs themed-muted">
                {formatDate(e.eventDate)}
              </span>
              {e.category && <span className="themed-tag text-xs">{e.category}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
