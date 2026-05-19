import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { canEditContent } from "@/lib/roles";

export default async function EventPage({
  params,
}: {
  params: Promise<{ publisher: string; eventSlug: string }>;
}) {
  const { publisher: publisherSlug, eventSlug } = await params;

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

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <nav className="text-sm themed-muted mb-6">
        <Link href={`/${publisherSlug}/events`} className="themed-link">
          Events
        </Link>
        <span className="mx-2">›</span>
        <span>{event.title}</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight themed-heading mb-3">
          {event.title}
        </h1>
        <div className="flex items-center gap-4 text-xs themed-muted flex-wrap">
          <span>
            {event.eventDate.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          {event.category && (
            <>
              <span className="opacity-30">·</span>
              <span className="px-2 py-0.5 rounded-full themed-surface border themed-border">
                {event.category}
              </span>
            </>
          )}
          {isEditor && (
            <>
              <span className="opacity-30">·</span>
              <Link
                href={`/${publisherSlug}/events/${eventSlug}/edit`}
                className="themed-link underline underline-offset-2"
              >
                Edit
              </Link>
            </>
          )}
        </div>
      </header>

      {event.description && (
        <div className="themed-muted leading-relaxed whitespace-pre-wrap">
          {event.description}
        </div>
      )}
    </main>
  );
}
