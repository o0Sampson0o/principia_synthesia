import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { canEditContent } from "@/lib/roles";
import { getNextOccurrences, describeRecurrence } from "@/lib/recurrence";

export default async function EventPage({
  params,
}: {
  params: Promise<{ publisher: string; eventSlug: string }>;
}) {
  const { publisher: publisherSlug, eventSlug: rawEventSlug } = await params;
  const eventSlug = rawEventSlug.split("--")[0];

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const session = await getSession();

  if (
    !(await canView(
      { type: "event", ownerType, ownerId, slug: eventSlug },
      session
    ))
  ) {
    notFound();
  }

  const [event] = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.slug, eventSlug),
        eq(events.ownerType, ownerType),
        eq(events.ownerId, ownerId)
      )
    )
    .limit(1);

  if (!event) notFound();

  const isEditor = await canEditContent(session, ownerType, ownerId);

  const nextOccurrences = event.recurrenceRule
    ? getNextOccurrences(
        {
          ...event,
          publisherSlug: publisherSlug,
          recurrenceRule: event.recurrenceRule,
          recurrenceUntil: event.recurrenceUntil,
        },
        5
      )
    : [];

  return (
    <main className="max-w-4xl mx-auto px-5 py-12 sm:py-16">

      <Link href={`/${publisherSlug}/events`} className="ps-eyebrow inline-flex items-center gap-1.5 mb-6 hover:opacity-70 transition-opacity">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5m7-7-7 7 7 7" />
        </svg>
        Events
      </Link>

      <header className="mb-10">
        <h1 className="ps-display themed-heading mb-5" style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}>
          {event.title}
        </h1>
        <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: "0.8125rem" }}>
          <span className="themed-muted">
            {event.eventDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </span>
          {event.category && (
            <>
              <span className="themed-muted opacity-30">·</span>
              <span className="themed-badge">{event.category}</span>
            </>
          )}
          {isEditor && (
            <>
              <span className="themed-muted opacity-30">·</span>
              <Link href={`/${publisherSlug}/events/${eventSlug}/edit`} className="themed-nav-link hover:text-[var(--foreground)] transition-colors">
                Edit
              </Link>
            </>
          )}
        </div>
      </header>

      {event.description && (
        <p className="themed-secondary leading-relaxed whitespace-pre-wrap" style={{ fontSize: "1rem", lineHeight: 1.75 }}>
          {event.description}
        </p>
      )}

      {event.recurrenceRule && (
        <div className="mt-8 ps-content-box">
          <div className="ps-content-row flex-col items-start gap-3">
            <p className="ps-eyebrow-muted">Recurrence</p>
            <p className="themed-secondary" style={{ fontSize: "0.9375rem" }}>
              Repeats {describeRecurrence(event.recurrenceRule)}
            </p>
            {nextOccurrences.length > 0 && (
              <div>
                <p className="ps-eyebrow-muted mb-2">Upcoming</p>
                <ul className="space-y-1">
                  {nextOccurrences.map((date) => (
                    <li key={date.toISOString()} className="themed-muted" style={{ fontSize: "0.875rem" }}>
                      {date.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

    </main>
  );
}
