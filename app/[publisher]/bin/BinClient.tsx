"use client";
import { restoreArticle, permanentlyDeleteArticle, restoreBook, permanentlyDeleteBook } from "./actions";

type BinItem = {
  kind: "article" | "book";
  id: number;
  slug: string;
  title: string;
  deletedAt: Date;
  expiresAt: Date;
  daysLeft: number;
};

export default function BinClient({ publisherSlug, items }: { publisherSlug: string; items: BinItem[] }) {
  if (items.length === 0) {
    return <p className="themed-muted text-sm">The bin is empty.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const restore = item.kind === "book" ? restoreBook : restoreArticle;
        const purge = item.kind === "book" ? permanentlyDeleteBook : permanentlyDeleteArticle;
        const confirmText =
          item.kind === "book"
            ? "Permanently delete this book? Its internal chapters, snapshots and curriculum are deleted with it. This cannot be undone."
            : "Permanently delete? This cannot be undone.";
        return (
          <li key={`${item.kind}-${item.id}`} className="themed-surface border themed-border rounded-lg px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium themed-heading truncate">
                {item.title}
                {item.kind === "book" && (
                  <span className="ml-2 text-xs font-normal themed-muted border themed-border rounded px-1.5 py-0.5 align-middle">Book</span>
                )}
              </p>
              <p className="text-xs themed-muted">
                Deleted &middot; auto-purge in {item.daysLeft} day{item.daysLeft === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <form action={restore.bind(null, publisherSlug)}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="themed-btn-ghost text-sm">Restore</button>
              </form>
              <form action={purge.bind(null, publisherSlug)}
                onSubmit={(e) => { if (!confirm(confirmText)) e.preventDefault(); }}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="text-sm text-red-500 hover:text-red-700 transition-colors">Delete forever</button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
