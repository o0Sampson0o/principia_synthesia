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
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold themed-heading mb-1">Eras</h1>
          <p className="themed-muted text-sm">
            <Link href={`/${publisherSlug}/events`} className="themed-link hover:underline">
              ← Events
            </Link>
          </p>
        </div>
        <Link
          href={`/${publisherSlug}/events/eras/new`}
          className="themed-btn-primary text-sm px-4 py-2 self-start sm:self-auto"
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
