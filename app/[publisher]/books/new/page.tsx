import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import CategoryPicker from "@/components/CategoryPicker";
import { createBook } from "../actions";

export default async function NewBookPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await requireSession();
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}`);
  }

  const action = createBook.bind(null, publisherSlug);

  return (
    <main className="w-full max-w-xl mx-auto px-5 py-10 sm:py-14">
      <div className="mb-8">
        <p className="ps-eyebrow mb-1.5">Book</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>New book</h1>
      </div>
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="title" className="block font-medium themed-secondary mb-1.5" style={{ fontSize: "0.75rem" }}>
            Title
          </label>
          <input id="title" name="title" type="text" required maxLength={200} className="themed-input" />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium themed-secondary mb-1">
            Slug
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm themed-muted">book-</span>
            <input
              id="slug"
              name="slug"
              type="text"
              required
              placeholder="my-book"
              className="themed-input flex-1"
              pattern="^book-[a-z0-9]+(?:-[a-z0-9]+)*$"
            />
          </div>
          <p className="text-xs themed-muted mt-1">Must start with &ldquo;book-&rdquo;.</p>
        </div>
        <div>
          <label htmlFor="summary" className="block text-sm font-medium themed-secondary mb-1">
            Summary
          </label>
          <textarea
            id="summary"
            name="summary"
            rows={3}
            maxLength={500}
            placeholder="Brief overview of this book..."
            className="themed-input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium themed-secondary mb-1">
            Tags
          </label>
          <CategoryPicker />
        </div>
        <button type="submit" className="themed-btn-accent rounded-lg">
          Create book
        </button>
      </form>
    </main>
  );
}
