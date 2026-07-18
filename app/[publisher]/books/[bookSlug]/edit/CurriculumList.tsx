"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

export type CurriculumRow =
  | {
      kind: "section";
      entryId: number;
      articleId: number;
      articleSlug: string;
      articleTitle: string;
      partTitle: string | null;
      isInternal: boolean;
      isExternal: boolean;
      articlePublisherSlug: string | null;
      booksCount: number;
    }
  | {
      kind: "part";
      entryId: number;
      partTitle: string | null;
    }
  | {
      kind: "chapter";
      entryId: number;
      partTitle: string | null;
    };

type ServerAction = (formData: FormData) => Promise<void>;

/**
 * Client-side curriculum list. Row CONTENT always renders from the server
 * props, so immediate actions (rename, remove, absorb, make standalone)
 * appear as soon as the server action revalidates. Only the ORDER lives in
 * local state — as an overlay of entry ids, null while pristine — so ↑/↓ are
 * instant and free, and nothing is written until "Save order" submits the
 * final arrangement in one call. "Cancel" drops the overlay.
 *
 * The parent keys this component on the saved entry-id order, so a save (or
 * a server-side add/remove) remounts it with a clean overlay.
 */
export default function CurriculumList({
  bookId,
  rows: savedRows,
  reorder,
  removeEntry,
  renamePart,
  renameChapterDivider,
  makeStandalone,
  absorb,
}: {
  bookId: number;
  rows: CurriculumRow[];
  reorder: ServerAction;
  removeEntry: ServerAction;
  renamePart: ServerAction;
  renameChapterDivider: ServerAction;
  makeStandalone: ServerAction;
  absorb: ServerAction;
}) {
  const [orderIds, setOrderIds] = useState<number[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const byId = new Map(savedRows.map((r) => [r.entryId, r]));
  const rows =
    orderIds === null
      ? savedRows
      : (orderIds.map((id) => byId.get(id)).filter(Boolean) as CurriculumRow[]);

  const dirty = rows.some((r, i) => r.entryId !== savedRows[i]?.entryId);

  function move(idx: number, delta: -1 | 1) {
    const next = rows.map((r) => r.entryId);
    [next[idx], next[idx + delta]] = [next[idx + delta], next[idx]];
    setOrderIds(next);
  }

  function saveOrder() {
    const formData = new FormData();
    formData.set("bookId", String(bookId));
    formData.set("orderedIds", JSON.stringify(rows.map((r) => r.entryId)));
    startTransition(async () => {
      await reorder(formData);
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm themed-muted mb-6">No sections yet.</p>;
  }

  // Section numbers skip BOTH divider kinds; derived (not mutated) so render
  // stays pure.
  const sectionNumbers = new Map<number | string, number>();
  {
    let n = 0;
    for (const row of rows) {
      if (row.kind === "section") sectionNumbers.set(row.entryId, ++n);
    }
  }

  return (
    <div className="mb-6">
      {dirty && (
        <div className="flex items-center gap-2 mb-3 p-2 border rounded themed-surface border-dashed">
          <span className="text-xs themed-muted flex-1">Order changed — not saved yet.</span>
          <button
            type="button"
            onClick={saveOrder}
            disabled={isPending}
            className="themed-btn-accent rounded text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save order"}
          </button>
          <button
            type="button"
            onClick={() => setOrderIds(null)}
            disabled={isPending}
            className="themed-btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
      <ol className="space-y-2">
        {rows.map((row, idx) => {
          const arrows = (
            <>
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={isPending}
                  className="themed-btn-ghost text-xs px-2 py-1"
                  title="Move up"
                >
                  ↑
                </button>
              )}
              {idx < rows.length - 1 && (
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={isPending}
                  className="themed-btn-ghost text-xs px-2 py-1"
                  title="Move down"
                >
                  ↓
                </button>
              )}
            </>
          );

          if (row.kind === "part" || row.kind === "chapter") {
            const isChapter = row.kind === "chapter";
            const renameAction = isChapter ? renameChapterDivider : renamePart;
            return (
              <li
                key={row.entryId}
                className={`flex items-center gap-2 p-3 border rounded themed-surface border-dashed ${isChapter ? "ml-4" : ""}`}
              >
                <span className="text-sm themed-muted w-6 shrink-0">&sect;</span>
                <form action={renameAction} className="flex-1 min-w-0 flex items-center gap-2">
                  <input type="hidden" name="entryId" value={row.entryId} />
                  <input type="hidden" name="bookId" value={bookId} />
                  <input
                    name="title"
                    type="text"
                    required
                    maxLength={200}
                    defaultValue={row.partTitle ?? ""}
                    className="themed-input text-sm flex-1 min-w-0 font-medium"
                    aria-label={isChapter ? "Chapter title" : "Part title"}
                  />
                  <button type="submit" className="themed-btn-ghost text-xs px-2 py-1">Rename</button>
                </form>
                <div className="flex items-center gap-1 shrink-0">
                  {arrows}
                  <form action={removeEntry}>
                    <input type="hidden" name="id" value={row.entryId} />
                    <input type="hidden" name="bookId" value={bookId} />
                    <button
                      type="submit"
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                      title={isChapter ? "Remove chapter" : "Remove part"}
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            );
          }

          const ch = row;
          const sectionNo = sectionNumbers.get(ch.entryId);

          return (
            <li
              key={ch.entryId}
              className="flex items-center gap-2 p-3 border rounded themed-surface ml-8"
            >
              <span className="text-sm themed-muted w-6 shrink-0">{sectionNo}.</span>
              <div className="flex-1 min-w-0">
                {ch.partTitle && (
                  <span className="text-xs themed-muted block">{ch.partTitle}</span>
                )}
                <span className="text-sm font-medium themed-heading truncate block">
                  {ch.articleTitle}
                </span>
                <span className="text-xs themed-muted">{ch.articleSlug}</span>
                {ch.isInternal && (
                  <span className="ml-2 themed-badge">
                    internal
                  </span>
                )}
                {ch.isExternal && (
                  <span
                    className="ml-2 text-xs px-1.5 py-0.5 rounded themed-tag"
                    title={`Borrowed from @${ch.articlePublisherSlug}`}
                  >
                    external &middot; By{" "}
                    <Link href={`/${ch.articlePublisherSlug}`} className="themed-link">
                      @{ch.articlePublisherSlug}
                    </Link>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {ch.isInternal && (
                  <form action={makeStandalone}>
                    <input type="hidden" name="articleId" value={ch.articleId} />
                    <button
                      type="submit"
                      className="themed-btn-ghost text-xs px-2 py-1"
                      title="Make this a standalone article. It stays a section here but also gets its own public URL and appears in listings, search and the sitemap. It will no longer be deleted along with the book."
                    >
                      Make standalone
                    </button>
                  </form>
                )}
                {!ch.isInternal && !ch.isExternal && ch.booksCount === 1 && (
                  <form action={absorb}>
                    <input type="hidden" name="articleId" value={ch.articleId} />
                    <input type="hidden" name="bookId" value={bookId} />
                    <button
                      type="submit"
                      className="themed-btn-ghost text-xs px-2 py-1"
                      title="Make this article internal to this book. It will be removed from your standalone article list, search and the sitemap, its public /articles URL will stop working, and it will be deleted if this book is deleted."
                    >
                      Make internal
                    </button>
                  </form>
                )}
                {!ch.isInternal && !ch.isExternal && ch.booksCount > 1 && (
                  <span
                    className="text-xs themed-muted px-2 py-1"
                    title="This article is used in other books. Remove it from those books first to make it internal to this one."
                  >
                    in {ch.booksCount} books
                  </span>
                )}
                {arrows}
                <form action={removeEntry}>
                  <input type="hidden" name="id" value={ch.entryId} />
                  <input type="hidden" name="bookId" value={bookId} />
                  <button
                    type="submit"
                    className={`themed-btn-ghost text-xs px-2 py-1 ${ch.isExternal ? "text-blue-500" : "text-red-500"}`}
                    title={ch.isExternal ? "Remove from this book (the original article is not affected)" : undefined}
                  >
                    {ch.isExternal ? "Unlink" : "Remove"}
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
