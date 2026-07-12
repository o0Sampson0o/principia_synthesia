import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { deriveEras, eraToSlug } from "@/lib/timeline-utils";

export default async function ErasPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const session = await getSession();
  const isOwner = await canEditContent(session, ownerType, ownerId);
  if (!isOwner) notFound();

  const allEvents = await db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      eventDate: events.eventDate,
      isEraStart: events.isEraStart,
      isEraEnd: events.isEraEnd,
      eraName: events.eraName,
      category: events.category,
      description: events.description,
    })
    .from(events)
    .where(and(eq(events.ownerType, ownerType), eq(events.ownerId, ownerId)));

  const eras = deriveEras(allEvents.map((e) => ({ ...e, publisherSlug: pub.slug })));

  const eraEventCounts: Record<string, number> = {};
  for (const e of allEvents) {
    if (e.eraName && !e.isEraStart && !e.isEraEnd) {
      eraEventCounts[e.eraName] = (eraEventCounts[e.eraName] ?? 0) + 1;
    }
  }

  const markerMap: Record<string, { startId: number | null; endId: number | null }> = {};
  for (const e of allEvents) {
    if (e.eraName && (e.isEraStart || e.isEraEnd)) {
      if (!markerMap[e.eraName]) markerMap[e.eraName] = { startId: null, endId: null };
      if (e.isEraStart) markerMap[e.eraName].startId = e.id;
      if (e.isEraEnd) markerMap[e.eraName].endId = e.id;
    }
  }

  return (
    <main className="w-full max-w-5xl mx-auto px-5 py-10 sm:py-14">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
        <div>
          <Link href={`/${publisherSlug}/events`} className="ps-eyebrow inline-flex items-center gap-1.5 mb-1.5 hover:opacity-70 transition-opacity">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
            Events
          </Link>
          <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>Eras</h1>
        </div>
        <Link
          href={`/${publisherSlug}/events/eras/new`}
          className="themed-btn-accent rounded-lg self-start sm:self-auto" style={{ fontSize: "0.8125rem", padding: "0.45rem 1rem" }}
        >
          New era
        </Link>
      </div>

      {eras.length === 0 ? (
        <p className="themed-muted">No eras defined yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b themed-border text-left">
                <th className="pb-2 pr-4 themed-secondary font-medium">Era name</th>
                <th className="pb-2 pr-4 themed-secondary font-medium">Start year</th>
                <th className="pb-2 pr-4 themed-secondary font-medium">End year</th>
                <th className="pb-2 pr-4 themed-secondary font-medium">Events</th>
                <th className="pb-2 themed-secondary font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {eras.map((era) => (
                <tr key={era.name} className="border-b themed-border">
                  <td className="py-3 pr-4 themed-heading font-medium">{era.name}</td>
                  <td className="py-3 pr-4 themed-secondary tabular-nums">{era.startYear}</td>
                  <td className="py-3 pr-4 themed-secondary tabular-nums">
                    {era.endYear ?? <span className="themed-muted">open</span>}
                  </td>
                  <td className="py-3 pr-4 themed-secondary tabular-nums">
                    {eraEventCounts[era.name] ?? 0}
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/${publisherSlug}/events/eras/${eraToSlug(era.name)}`}
                      className="themed-link text-xs hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
