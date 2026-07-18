import { redirect, notFound } from "next/navigation";
import FormErrorBanner from "@/components/FormErrorBanner";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { createEvent } from "@/app/[publisher]/events/actions";

export default async function NewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ publisher: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ publisher: publisherSlug }, { error }] = await Promise.all([params, searchParams]);
  const errorMessage =
    error === "slug_taken"
      ? "An event with this slug already exists. Pick a different slug."
      : error === "invalid"
      ? "The event could not be saved — please check the fields and try again."
      : null;

  const session = await requireSession();
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}`);
  }

  async function action(formData: FormData): Promise<void> {
    "use server";
    const result = await createEvent(publisherSlug, null, formData);
    if (result?.errors) {
      const code = result.errors.slug ? "slug_taken" : "invalid";
      redirect(`/${publisherSlug}/events/new?error=${code}`);
    }
  }

  return (
    <main className="w-full max-w-2xl mx-auto px-5 py-10 sm:py-14">
      <div className="mb-8">
        <p className="ps-eyebrow mb-1.5">Event</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>New event</h1>
      </div>

      <FormErrorBanner message={errorMessage} />

      <form action={action} className="space-y-6">
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

        <button type="submit" className="themed-btn-accent rounded-lg">
          Create event
        </button>
      </form>
    </main>
  );
}
