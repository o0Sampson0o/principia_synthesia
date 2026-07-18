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
import ToastForm from "@/components/ToastForm";
import ConfirmButton from "@/components/ConfirmButton";

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
 * One sortable row: provides the drag handle (only the handle starts a drag,
 * so the rename input, links, and action buttons inside stay interactive) and
 * the transform/lift while dragging. The row's kind-specific markup is passed
 * as children. Rows are flush hairline dividers (the List Row signature), not
 * boxed cards.
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
      className={`group flex items-center gap-2 py-2.5 px-1 border-b themed-border ${className}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        background: isDragging ? "var(--surface)" : undefined,
        boxShadow: isDragging ? "0 10px 34px rgba(0,0,0,0.16)" : undefined,
        borderRadius: isDragging ? "0.5rem" : undefined,
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <button
        type="button"
        className="themed-muted themed-hover-foreground shrink-0 cursor-grab active:cursor-grabbing rounded-md transition-colors"
        style={{ fontSize: "1rem", lineHeight: 1, padding: "0.5rem 0.375rem", touchAction: "none" }}
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

/**
 * Client-side curriculum list. Row CONTENT always renders from the server
 * props, so immediate actions (rename, remove, absorb, make standalone) appear
 * as soon as the server action revalidates. Only the ORDER lives in local
 * state — an overlay of entry ids, null while pristine — so drag-and-drop is
 * instant and nothing is written until "Save order" submits the final
 * arrangement in one call. "Cancel" drops the overlay.
 *
 * The parent keys this component on the saved entry-id order, so a save (or a
 * server-side add/remove) remounts it with a clean overlay.
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
    return (
      <p className="text-sm themed-muted mb-6">
        No sections yet — add one below, and group them with parts and chapters.
      </p>
    );
  }

  // Section numbers skip BOTH divider kinds; derived (not mutated) so render
  // stays pure.
  const sectionNumbers = new Map<number, number>();
  {
    let n = 0;
    for (const row of rows) {
      if (row.kind === "section") sectionNumbers.set(row.entryId, ++n);
    }
  }

  return (
    <div className="mb-6">
      {dirty && (
        <div
          className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border themed-border"
          style={{ background: "var(--surface)" }}
        >
          <span className="text-xs themed-muted flex-1">Order changed — not saved yet.</span>
          <button
            type="button"
            onClick={saveOrder}
            disabled={isPending}
            className="themed-btn-accent rounded-lg text-xs px-3 py-1.5 disabled:opacity-50"
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
          <ol className="border-t themed-border">
            {rows.map((row) => {
              // ── Part / Chapter divider ──────────────────────────────
              if (row.kind === "part" || row.kind === "chapter") {
                const isChapter = row.kind === "chapter";
                const renameAction = isChapter ? renameChapterDivider : renamePart;
                return (
                  <SortableRow
                    key={row.entryId}
                    id={row.entryId}
                    className={isChapter ? "pl-6" : ""}
                  >
                    <span
                      className="ps-mono-micro themed-muted shrink-0"
                      style={{ width: "3.75rem" }}
                    >
                      {isChapter ? "Chapter" : "Part"}
                    </span>
                    <ToastForm
                      action={renameAction}
                      errorTitle="Not renamed"
                      className="flex-1 min-w-0 flex items-center gap-2"
                    >
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
                      <button type="submit" className="themed-btn-ghost text-xs px-2 py-1 shrink-0">
                        Rename
                      </button>
                    </ToastForm>
                    <ToastForm action={removeEntry} errorTitle="Not removed" className="shrink-0">
                      <input type="hidden" name="id" value={row.entryId} />
                      <input type="hidden" name="bookId" value={bookId} />
                      <ConfirmButton
                        title={isChapter ? "Remove chapter" : "Remove part"}
                        message={`This removes the ${isChapter ? "chapter" : "part"} label only. The sections under it stay in the book and fold into the ${isChapter ? "part" : "book"} above.`}
                        confirmLabel="Remove"
                        danger
                        className="ps-quiet-action ps-quiet-action-danger"
                      >
                        Remove
                      </ConfirmButton>
                    </ToastForm>
                  </SortableRow>
                );
              }

              // ── Section (article) ───────────────────────────────────
              const ch = row;
              const sectionNo = sectionNumbers.get(ch.entryId);
              return (
                <SortableRow key={ch.entryId} id={ch.entryId} className="pl-6 flex-wrap">
                  <span
                    className="ps-mono-meta themed-muted shrink-0 tabular-nums"
                    style={{ width: "1.75rem" }}
                  >
                    {String(sectionNo).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium themed-heading truncate block">
                      {ch.articleTitle}
                    </span>
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs themed-muted">{ch.articleSlug}</span>
                      {ch.isInternal && <span className="themed-badge">internal</span>}
                      {ch.isExternal && (
                        <span className="themed-tag text-xs" title={`Borrowed from @${ch.articlePublisherSlug}`}>
                          external ·{" "}
                          <Link href={`/${ch.articlePublisherSlug}`} className="themed-link">
                            @{ch.articlePublisherSlug}
                          </Link>
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                    {ch.isInternal && (
                      <ToastForm action={makeStandalone} errorTitle="Not changed">
                        <input type="hidden" name="articleId" value={ch.articleId} />
                        <ConfirmButton
                          title="Make standalone"
                          message="This gives the section its own public /articles URL and lists it in search and the sitemap. It stays in this book but is no longer deleted along with it."
                          confirmLabel="Make standalone"
                          className="ps-quiet-action"
                        >
                          Make standalone
                        </ConfirmButton>
                      </ToastForm>
                    )}
                    {!ch.isInternal && !ch.isExternal && ch.booksCount === 1 && (
                      <ToastForm action={absorb} errorTitle="Not changed">
                        <input type="hidden" name="articleId" value={ch.articleId} />
                        <input type="hidden" name="bookId" value={bookId} />
                        <ConfirmButton
                          title="Make internal"
                          message="This makes the article internal to this book: its public /articles URL stops working, it leaves your standalone list, search and the sitemap, and it is deleted if this book is deleted."
                          confirmLabel="Make internal"
                          danger
                          className="ps-quiet-action"
                        >
                          Make internal
                        </ConfirmButton>
                      </ToastForm>
                    )}
                    {!ch.isInternal && !ch.isExternal && ch.booksCount > 1 && (
                      <span
                        className="text-xs themed-muted px-2 py-1"
                        title="This article is used in other books. Remove it from those books first to make it internal to this one."
                      >
                        in {ch.booksCount} books
                      </span>
                    )}
                    <ToastForm action={removeEntry} errorTitle="Not removed">
                      <input type="hidden" name="id" value={ch.entryId} />
                      <input type="hidden" name="bookId" value={bookId} />
                      <ConfirmButton
                        title={ch.isExternal ? "Unlink section" : "Remove section"}
                        message={
                          ch.isExternal
                            ? "This removes the borrowed article from this book. The original article is not affected."
                            : ch.isInternal
                            ? "This permanently deletes this internal section's article. It cannot be undone."
                            : "This removes the section from this book. The standalone article itself is not deleted."
                        }
                        confirmLabel={ch.isExternal ? "Unlink" : "Remove"}
                        danger={!ch.isExternal}
                        className={`ps-quiet-action ${ch.isExternal ? "" : "ps-quiet-action-danger"}`}
                      >
                        {ch.isExternal ? "Unlink" : "Remove"}
                      </ConfirmButton>
                    </ToastForm>
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
