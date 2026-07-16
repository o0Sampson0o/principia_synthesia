"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

export type CurriculumRow =
  | {
      kind: "chapter";
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
    };

type ServerAction = (formData: FormData) => Promise<void>;

/**
 * Client-side curriculum list: ↑/↓ reorder instantly in local state; nothing
 * touches the server until "Save order" submits the final arrangement in one
 * call. "Cancel" restores the saved order. All other row actions (rename,
 * remove, absorb, make standalone) stay immediate server actions.
 *
 * The parent keys this component on the saved entry-id order, so a successful
 * save (or any server-side change) remounts it with fresh, clean state.
 */
export default function CurriculumList({
  bookId,
  rows: savedRows,
  reorder,
  removeEntry,
  renamePart,
  makeStandalone,
  absorb,
}: {
  bookId: number;
  rows: CurriculumRow[];
  reorder: ServerAction;
  removeEntry: ServerAction;
  renamePart: ServerAction;
  makeStandalone: ServerAction;
  absorb: ServerAction;
}) {
  const [rows, setRows] = useState(savedRows);
  const [isPending, startTransition] = useTransition();

  const dirty = rows.some((r, i) => r.entryId !== savedRows[i]?.entryId);

  function move(idx: number, delta: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      [next[idx], next[idx + delta]] = [next[idx + delta], next[idx]];
      return next;
    });
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
    return <p className="text-sm themed-muted mb-6">No chapters yet.</p>;
  }

  let chapterNo = 0;

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
            onClick={() => setRows(savedRows)}
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

          if (row.kind === "part") {
            return (
              <li key={row.entryId} className="flex items-center gap-2 p-3 border rounded themed-surface border-dashed">
                <span className="text-sm themed-muted w-6 shrink-0">&sect;</span>
                <form action={renamePart} className="flex-1 min-w-0 flex items-center gap-2">
                  <input type="hidden" name="entryId" value={row.entryId} />
                  <input type="hidden" name="bookId" value={bookId} />
                  <input
                    name="title"
                    type="text"
                    required
                    maxLength={200}
                    defaultValue={row.partTitle ?? ""}
                    className="themed-input text-sm flex-1 min-w-0 font-medium"
                    aria-label="Part title"
                  />
                  <button type="submit" className="themed-btn-ghost text-xs px-2 py-1">Rename</button>
                </form>
                <div className="flex items-center gap-1 shrink-0">
                  {arrows}
                  <form action={removeEntry}>
                    <input type="hidden" name="id" value={row.entryId} />
                    <input type="hidden" name="bookId" value={bookId} />
                    <button type="submit" className="text-xs text-red-500 hover:text-red-700 px-2 py-1" title="Remove part">
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            );
          }

          const ch = row;
          chapterNo += 1;

          return (
            <li
              key={ch.entryId}
              className={`flex items-center gap-2 p-3 border rounded themed-surface ${
                ch.isExternal ? "border-l-4 border-l-blue-500" : ""
              }`}
            >
              <span className="text-sm themed-muted w-6 shrink-0">{chapterNo}.</span>
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
                      title="Make this a standalone article. It stays a chapter here but also gets its own public URL and appears in listings, search and the sitemap. It will no longer be deleted along with the book."
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
