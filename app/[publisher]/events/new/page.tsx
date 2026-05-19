import { redirect, notFound } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { createEvent } from "@/app/[publisher]/events/actions";

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;

  const session = await requireSession();
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}`);
  }

  const action = createEvent.bind(null, publisherSlug, null);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold themed-heading mb-8">New event</h1>

      <form action={action as (fd: FormData) => void} className="space-y-6">
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
            placeholder="event-my-event"
            className="themed-input w-full"
          />
          <p className="text-xs themed-muted mt-1">Must start with event-</p>
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
            placeholder="article-slug-one, article-slug-two"
            className="themed-input w-full"
          />
          <p className="text-xs themed-muted mt-1">Comma-separated slugs of related articles</p>
        </div>

        <fieldset className="space-y-3 rounded-md border themed-border p-4">
          <legend className="text-sm font-medium themed-heading px-1">Era markers</legend>
          <div className="flex items-center gap-2">
            <input id="isEraStart" type="checkbox" name="isEraStart" className="h-4 w-4" />
            <label htmlFor="isEraStart" className="text-sm themed-heading">Mark as era start</label>
          </div>
          <div className="flex items-center gap-2">
            <input id="isEraEnd" type="checkbox" name="isEraEnd" className="h-4 w-4" />
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
              placeholder="e.g. Quantum Physics"
              className="themed-input w-full"
            />
            <p className="text-xs themed-muted mt-1">
              Required when marking as era start or end. Used to match starts with ends.
            </p>
          </div>
        </fieldset>

        <button type="submit" className="themed-btn-primary px-6 py-2">
          Create event
        </button>
      </form>
    </main>
  );
}
