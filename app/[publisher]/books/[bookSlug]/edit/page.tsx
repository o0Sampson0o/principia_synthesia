import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { db } from "@/db";
import { books } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { updateBook, deleteBook } from "../../actions";

export default async function EditBookPage({
  params,
}: {
  params: Promise<{ publisher: string; bookSlug: string }>;
}) {
  const { publisher: publisherSlug, bookSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await requireSession();
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}/books/${bookSlug}`);
  }

  const [bookRow] = await db
    .select()
    .from(books)
    .where(
      and(
        eq(books.slug, bookSlug),
        eq(books.ownerType, ownerType),
        eq(books.ownerId, ownerId)
      )
    )
    .limit(1);

  if (!bookRow) notFound();

  async function action(formData: FormData): Promise<void> {
    "use server";
    await updateBook(publisherSlug, formData);
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold themed-heading mb-6">Edit book</h1>
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={bookRow.id} />
        <div>
          <label htmlFor="title" className="block text-sm font-medium themed-secondary mb-1">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={200}
            defaultValue={bookRow.title}
            className="themed-input"
          />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium themed-secondary mb-1">
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            defaultValue={bookRow.slug}
            className="themed-input"
          />
        </div>
        <button type="submit" className="themed-btn-primary">
          Save changes
        </button>
      </form>

      <section className="mt-12 border-t border-red-200 pt-8">
        <h2 className="text-lg font-semibold text-red-600 mb-2">Danger zone</h2>
        <p className="text-sm themed-muted mb-4">
          Deleting a book is permanent and cannot be undone. All curriculum entries and internal
          articles will be removed.
        </p>
        <form action={deleteBook.bind(null, publisherSlug)}>
          <input type="hidden" name="bookId" value={bookRow.id} />
          <button type="submit" className="themed-btn-ghost text-red-600 hover:bg-red-50">
            Delete book
          </button>
        </form>
      </section>
    </main>
  );
}
