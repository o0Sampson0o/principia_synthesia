import { db } from "@/db";
import { bookSnapshots, bookSnapshotEntries, curriculumEntries } from "@/db/schema";
import { eq, asc, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import SnapshotActions from "./SnapshotActions";

export default async function BookSnapshotsPage({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book: bookSlug } = await params;

  // Verify the book exists
  const bookCheck = await db
    .select({ bookSlug: curriculumEntries.bookSlug, bookTitle: curriculumEntries.bookTitle })
    .from(curriculumEntries)
    .where(eq(curriculumEntries.bookSlug, bookSlug))
    .limit(1);

  if (bookCheck.length === 0) notFound();

  const bookTitle = bookCheck[0].bookTitle;

  const snapshots = await db
    .select({
      id: bookSnapshots.id,
      bookSlug: bookSnapshots.bookSlug,
      bookTitle: bookSnapshots.bookTitle,
      note: bookSnapshots.note,
      createdAt: bookSnapshots.createdAt,
    })
    .from(bookSnapshots)
    .where(eq(bookSnapshots.bookSlug, bookSlug))
    .orderBy(asc(bookSnapshots.createdAt));

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link
            href="/admin/curriculum"
            className="text-sm themed-muted hover:themed-heading transition-colors mb-2 inline-block"
          >
            ← Back to curriculum
          </Link>
          <h1 className="text-3xl font-bold">
            Snapshots{" "}
            <span className="text-lg font-normal themed-muted">— {bookTitle}</span>
          </h1>
        </div>
      </div>

      {/* Take new snapshot */}
      <SnapshotActions bookSlug={bookSlug} />

      {/* Snapshot list */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold mb-4">
          Saved snapshots
          {snapshots.length > 0 && (
            <span className="ml-2 text-sm font-normal themed-muted">
              ({snapshots.length})
            </span>
          )}
        </h2>

        {snapshots.length === 0 ? (
          <div className="rounded-xl border border-dashed themed-border p-8 text-center">
            <p className="text-sm themed-muted">
              No snapshots yet. Use the form above to save one.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {snapshots.slice().reverse().map((snap) => (
              <div
                key={snap.id}
                className="rounded-xl border themed-border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium themed-heading truncate">
                    {snap.note ?? `Snapshot #${snap.id}`}
                  </p>
                  <p className="text-xs themed-muted mt-0.5">
                    {snap.createdAt
                      ? new Date(snap.createdAt).toLocaleString()
                      : "Unknown date"}
                  </p>
                </div>
                <SnapshotActions bookSlug={bookSlug} snapshotId={snap.id} restoreOnly />
              </div>
            ))}
          </div>
        )}
      </div>

      {snapshots.length > 0 && (
        <p className="mt-6 text-xs themed-muted">
          Restoring a snapshot replaces the current book order. Article content is only
          overwritten if you check &quot;Restore article content&quot;.
        </p>
      )}
    </main>
  );
}
