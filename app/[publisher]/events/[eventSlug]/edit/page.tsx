import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { db } from "@/db";
import { events, eventArticles, articles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { updateEvent, deleteEvent } from "@/app/[publisher]/events/actions";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ publisher: string; eventSlug: string }>;
}) {
  const { publisher: publisherSlug, eventSlug } = await params;

  const session = await requireSession();
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}`);
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

  const linkedArticles = await db
    .select({ slug: articles.slug })
    .from(eventArticles)
    .innerJoin(articles, eq(eventArticles.articleId, articles.id))
    .where(eq(eventArticles.eventId, event.id));

  const prefilledSlugs = linkedArticles.map((a) => a.slug).join(", ");
  const eventDateDefault = event.eventDate.toISOString().split("T")[0];

  const updateAction = updateEvent.bind(null, publisherSlug, null);
  const deleteAction = deleteEvent.bind(null, publisherSlug);

  return (
    <main className="max-w-2xl mx-auto px-5 py-10 sm:py-14">
      <Link href={`/${publisherSlug}/events/${eventSlug}`} className="ps-eyebrow inline-flex items-center gap-1.5 mb-6 hover:opacity-70 transition-opacity">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
        {event.title}
      </Link>
      <div className="mb-8">
        <p className="ps-eyebrow mb-1.5">Event</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>Edit event</h1>
      </div>

      <form action={updateAction as (fd: FormData) => void} className="space-y-6">
        <input type="hidden" name="id" value={event.id} />

        <div>
          <label className="block text-sm font-medium themed-heading mb-1" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            type="text"
            name="title"
            required
            maxLength={200}
            defaultValue={event.title}
            className="themed-input w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium themed-heading mb-1" htmlFor="slug">
            Slug
          </label>
          <input
            id="slug"
            type="text"
            name="slug"
            required
            pattern="^event-[a-z0-9]+(?:-[a-z0-9]+)*$"
            defaultValue={event.slug}
            className="themed-input w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium themed-heading mb-1" htmlFor="eventDate">
            Date
          </label>
          <input
            id="eventDate"
            type="date"
            name="eventDate"
            required
            defaultValue={eventDateDefault}
            className="themed-input w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium themed-heading mb-1" htmlFor="category">
            Category
          </label>
          <input
            id="category"
            type="text"
            name="category"
            maxLength={100}
            defaultValue={event.category ?? ""}
            className="themed-input w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium themed-heading mb-1" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            maxLength={5000}
            rows={4}
            defaultValue={event.description ?? ""}
            className="themed-input w-full"
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium themed-heading mb-1"
            htmlFor="relatedArticleSlugs"
          >
            Related article slugs
          </label>
          <input
            id="relatedArticleSlugs"
            type="text"
            name="relatedArticleSlugs"
            defaultValue={prefilledSlugs}
            placeholder="article-slug-one, article-slug-two"
            className="themed-input w-full"
          />
          <p className="text-xs themed-muted mt-1">Comma-separated slugs of related articles</p>
        </div>

        <fieldset className="space-y-3 rounded-md border themed-border p-4">
          <legend className="text-sm font-medium themed-heading px-1">Era markers</legend>
          <div className="flex items-center gap-2">
            <input id="isEraStart" type="checkbox" name="isEraStart" defaultChecked={event.isEraStart} className="h-4 w-4" />
            <label htmlFor="isEraStart" className="text-sm themed-heading">Mark as era start</label>
          </div>
          <div className="flex items-center gap-2">
            <input id="isEraEnd" type="checkbox" name="isEraEnd" defaultChecked={event.isEraEnd} className="h-4 w-4" />
            <label htmlFor="isEraEnd" className="text-sm themed-heading">Mark as era end</label>
          </div>
          <div>
            <label className="block text-sm font-medium themed-heading mb-1" htmlFor="eraName">
              Era name
            </label>
            <input
              id="eraName"
              type="text"
              name="eraName"
              maxLength={100}
              defaultValue={event.eraName ?? ""}
              className="themed-input w-full"
            />
            <p className="text-xs themed-muted mt-1">
              Required when marking as era start or end. Used to match starts with ends.
            </p>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button type="submit" className="themed-btn-accent rounded-lg">
            Save changes
          </button>
          <Link
            href={`/${publisherSlug}/events/${eventSlug}/access`}
            className="themed-btn-ghost text-sm px-4 py-2"
          >
            Access &amp; visibility
          </Link>
        </div>
      </form>

      <hr className="my-8 themed-border" />

      <section>
        <h2 className="text-lg font-semibold themed-heading mb-4">Delete event</h2>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="slug" value={event.slug} />
          <button
            type="submit"
            className="text-sm text-red-500 themed-btn-ghost px-4 py-2"
          >
            Delete event
          </button>
        </form>
      </section>
    </main>
  );
}
