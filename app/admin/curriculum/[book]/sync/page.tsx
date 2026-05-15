import { db } from "@/db";
import { curriculumEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import SyncImportForm from "./SyncImportForm";

export default async function BookSyncPage({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book: bookSlug } = await params;

  const bookCheck = await db
    .select({ bookTitle: curriculumEntries.bookTitle })
    .from(curriculumEntries)
    .where(eq(curriculumEntries.bookSlug, bookSlug))
    .limit(1);

  if (bookCheck.length === 0) notFound();
  const bookTitle = bookCheck[0].bookTitle;

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link
        href="/admin/curriculum"
        className="text-sm themed-muted hover:themed-heading transition-colors mb-2 inline-block"
      >
        ← Back to curriculum
      </Link>
      <h1 className="text-3xl font-bold mb-1">Sync</h1>
      <p className="text-sm themed-muted mb-8">
        {bookTitle} <span className="themed-muted">({bookSlug})</span>
      </p>

      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest themed-muted mb-4">
          Export
        </h2>
        <div className="rounded-lg border themed-border p-4">
          <p className="text-sm themed-muted mb-3">
            Download a zip containing book.json plus one raw MDX file per
            chapter. Edit the .mdx files in any text editor, then upload the zip
            back to merge changes (last-write-wins per chapter). Do not rename
            .mdx files — the filename must match the chapter slug exactly (case-sensitive).
          </p>
          <a
            href={`/api/curriculum/${bookSlug}/export/sync`}
            className="themed-btn-primary inline-block px-4 py-2 rounded text-sm"
            download
          >
            Download sync bundle
          </a>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest themed-muted mb-4">
          Import
        </h2>
        <SyncImportForm bookSlug={bookSlug} />
      </section>
    </main>
  );
}
