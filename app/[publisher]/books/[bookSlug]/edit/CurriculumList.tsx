"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * One sortable row: provides the drag handle (only the handle starts a drag,
 * so the rename input, links, and action buttons inside stay interactive) and
 * the transform/lift while dragging. The row's kind-specific markup is passed
 * as children.
 */
function SortableRow({
  id,
  className,
  children,
}: {
  id: number;
  className: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      className={className}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <button
        type="button"
        className="themed-btn-ghost shrink-0 cursor-grab active:cursor-grabbing px-1"
        style={{ fontSize: "0.9375rem", touchAction: "none" }}
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {children}
    </li>
  );
}

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

  const sensors = useSensors(
    // A small activation distance so a click on the handle can still fire
    // buttons/inputs elsewhere without accidental drags.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const byId = new Map(savedRows.map((r) => [r.entryId, r]));
  const rows =
    orderIds === null
      ? savedRows
      : (orderIds.map((id) => byId.get(id)).filter(Boolean) as CurriculumRow[]);

  const dirty = rows.some((r, i) => r.entryId !== savedRows[i]?.entryId);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = rows.map((r) => r.entryId);
    const from = ids.indexOf(active.id as number);
    const to = ids.indexOf(over.id as number);
    if (from === -1 || to === -1) return;
    setOrderIds(arrayMove(ids, from, to));
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
      <p className="text-xs themed-muted mb-2">Drag ⠿ to reorder parts, chapters, and sections.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rows.map((r) => r.entryId)} strategy={verticalListSortingStrategy}>
      <ol className="space-y-2">
        {rows.map((row) => {
          if (row.kind === "part" || row.kind === "chapter") {
            const isChapter = row.kind === "chapter";
            const renameAction = isChapter ? renameChapterDivider : renamePart;
            return (
              <SortableRow
                key={row.entryId}
                id={row.entryId}
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
              </SortableRow>
            );
          }

          const ch = row;
          const sectionNo = sectionNumbers.get(ch.entryId);

          return (
            <SortableRow
              key={ch.entryId}
              id={ch.entryId}
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
            </SortableRow>
          );
        })}
      </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}
