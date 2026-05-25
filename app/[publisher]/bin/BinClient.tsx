"use client";
import { restoreArticle, permanentlyDeleteArticle } from "./actions";

type BinArticle = {
  id: number;
  slug: string;
  title: string;
  deletedAt: Date;
  expiresAt: Date;
  daysLeft: number;
};

export default function BinClient({ publisherSlug, items }: { publisherSlug: string; items: BinArticle[] }) {
  if (items.length === 0) {
    return <p className="themed-muted text-sm">The bin is empty.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="themed-surface border themed-border rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium themed-heading truncate">{item.title}</p>
            <p className="text-xs themed-muted">
              Deleted &middot; auto-purge in {item.daysLeft} day{item.daysLeft === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <form action={restoreArticle.bind(null, publisherSlug)}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className="themed-btn-ghost text-sm">Restore</button>
            </form>
            <form action={permanentlyDeleteArticle.bind(null, publisherSlug)}
              onSubmit={(e) => { if (!confirm("Permanently delete? This cannot be undone.")) e.preventDefault(); }}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className="text-sm text-red-500 hover:text-red-700 transition-colors">Delete forever</button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
