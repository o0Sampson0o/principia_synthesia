import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { filterVisible } from "@/lib/access";
import Pagination from "@/components/Pagination";

const PER_PAGE = 20;

export default async function PublisherEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ publisher: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { publisher: publisherSlug } = await params;
  const { page } = await searchParams;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const session = await getSession();
  const isOwner = await canEditContent(session, ownerType, ownerId);

  const currentPage = Math.max(1, Number(page ?? 1));
  const offset = (currentPage - 1) * PER_PAGE;

  const [countResult, rawEvents] = await Promise.all([
    db
      .select({ total: count(events.id) })
      .from(events)
      .where(and(eq(events.ownerType, ownerType), eq(events.ownerId, ownerId))),
    db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        eventDate: events.eventDate,
        category: events.category,
      })
      .from(events)
      .where(and(eq(events.ownerType, ownerType), eq(events.ownerId, ownerId)))
      .orderBy(desc(events.eventDate))
      .limit(PER_PAGE)
      .offset(offset),
  ]);

  let visibleEvents = rawEvents;
  if (!isOwner) {
    const refs = rawEvents.map((e) => ({
      type: "event" as const,
      ownerType,
      ownerId,
      slug: e.slug,
    }));
    const visRefs = await filterVisible(refs, session);
    const visSlugs = new Set(visRefs.map((r) => r.slug));
    visibleEvents = rawEvents.filter((e) => visSlugs.has(e.slug));
  }

  const total = countResult[0]?.total ?? 0;
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold themed-heading mb-1">
            {pub.displayName}&rsquo;s events
          </h1>
          <p className="themed-muted text-sm">@{pub.slug}</p>
        </div>
        {isOwner && (
          <Link
            href={`/${publisherSlug}/events/new`}
            className="themed-btn-primary text-sm px-4 py-2 self-start sm:self-auto"
          >
            New event
          </Link>
        )}
      </div>

      {visibleEvents.length === 0 ? (
        <p className="themed-muted">No events yet.</p>
      ) : (
        <ul className="space-y-4">
          {visibleEvents.map((e) => (
            <li key={e.id} className="border-b themed-border pb-4">
              <Link
                href={`/${publisherSlug}/events/${e.slug}`}
                className="text-xl font-medium themed-link"
              >
                {e.title}
              </Link>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-xs themed-muted">
                  {new Date(e.eventDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                {e.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full themed-surface border themed-border themed-secondary">
                    {e.category}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath={`/${publisherSlug}/events`}
      />
    </main>
  );
}
