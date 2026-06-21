import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { deriveEras, eraToSlug } from "@/lib/timeline-utils";
import EraEditForm from "./EraEditForm";

export default async function EraDetailPage({
  params,
}: {
  params: Promise<{ publisher: string; eraSlug: string }>;
}) {
  const { publisher: publisherSlug, eraSlug } = await params;

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

  const eras = deriveEras(
    allEvents.map((e) => ({ ...e, publisherSlug: pub.slug }))
  );

  const era = eras.find((e) => eraToSlug(e.name) === eraSlug);
  if (!era) notFound();

  const markerEvents = allEvents.filter(
    (e) => e.eraName === era.name && (e.isEraStart || e.isEraEnd)
  );
  const startEvent = markerEvents.find((e) => e.isEraStart);
  const endEvent = markerEvents.find((e) => e.isEraEnd);

  const eventCount = allEvents.filter(
    (e) => e.eraName === era.name && !e.isEraStart && !e.isEraEnd
  ).length;

  return (
    <main className="max-w-2xl mx-auto px-5 py-10 sm:py-14">
      <Link href={`/${publisherSlug}/events/eras`} className="ps-eyebrow inline-flex items-center gap-1.5 mb-6 hover:opacity-70 transition-opacity">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
        Eras
      </Link>
      <div className="mb-8">
        <p className="ps-eyebrow mb-1.5">Era</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>{era.name}</h1>
      </div>

      <div className="themed-surface border themed-border rounded-lg p-4 mb-8">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="themed-secondary">Start year</dt>
          <dd className="themed-heading tabular-nums">{era.startYear}</dd>
          <dt className="themed-secondary">End year</dt>
          <dd className="themed-heading tabular-nums">{era.endYear ?? "open"}</dd>
          <dt className="themed-secondary">Events in era</dt>
          <dd className="themed-heading tabular-nums">{eventCount}</dd>
        </dl>
      </div>

      <EraEditForm
        publisherSlug={publisherSlug}
        era={era}
        startEventId={startEvent?.id ?? null}
        endEventId={endEvent?.id ?? null}
        startDate={startEvent?.eventDate?.toISOString().slice(0, 10) ?? ""}
        endDate={endEvent?.eventDate?.toISOString().slice(0, 10) ?? ""}
      />
    </main>
  );
}
