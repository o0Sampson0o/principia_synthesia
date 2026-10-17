"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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
import { toast, toastError } from "@/lib/toast";
import { uniqueSlug } from "@/lib/slugify";
import {
  parseOutline,
  sectionSlugBase,
  type OutlineItem,
  type OutlineKind,
  type ParsedOutlineItem,
} from "@/lib/book-outline";

/** A saved curriculum row, as the edit page loads it. */
export type CurriculumRow =
  | {
      kind: "section";
      entryId: number;
      articleId: number;
      articleSlug: string;
      articleTitle: string;
      isInternal: boolean;
      isExternal: boolean;
      articlePublisherSlug: string | null;
      booksCount: number;
    }
  | { kind: "part" | "chapter"; entryId: number; partTitle: string | null };

export interface AvailableArticle {
  id: number;
  slug: string;
  title: string;
}

type ServerAction = (formData: FormData) => Promise<void>;
type SaveAction = (formData: FormData) => Promise<{ error: string } | void>;

/**
 * One line of the outline. Four flavours, by which ids are present:
 *   entryId + section      saved section (title belongs to its article: read-only here)
 *   entryId + part/chapter saved divider (title and level editable)
 *   articleId, no entryId  standalone article being added (read-only)
 *   neither                new line typed here: a divider, or a new section
 */
interface EditorRow {
  key: string;
  kind: OutlineKind;
  title: string;
  entryId?: number;
  articleId?: number;
  slug?: string;
  isInternal?: boolean;
  isExternal?: boolean;
  publisherSlug?: string | null;
  booksCount?: number;
  /** Saved row marked for removal on save (shown struck through, undoable). */
  removed?: boolean;
}

const LEVELS: OutlineKind[] = ["part", "chapter", "section"];
const KIND_LABEL: Record<OutlineKind, string> = {
  part: "Part",
  chapter: "Chapter",
  section: "Section",
};

const isTitleEditable = (r: EditorRow) =>
  !(r.kind === "section" && (r.entryId || r.articleId));
const isNewRow = (r: EditorRow) => r.entryId === undefined;

/** Which levels a row may take: saved sections and added articles are fixed. */
function canBecome(r: EditorRow, to: OutlineKind): boolean {
  if (r.kind === to) return false;
  if (r.kind === "section" && (r.entryId || r.articleId)) return false;
  if (r.entryId && to === "section") return false; // a saved divider has no article
  return true;
}

/** The level a fresh line takes after Enter: one deeper than a divider. */
const levelAfter = (k: OutlineKind): OutlineKind =>
  k === "part" ? "chapter" : "section";

function fromSaved(rows: CurriculumRow[]): EditorRow[] {
  return rows.map((r) =>
    r.kind === "section"
      ? {
          key: `e${r.entryId}`,
          kind: "section",
          title: r.articleTitle,
          entryId: r.entryId,
          articleId: r.articleId,
          slug: r.articleSlug,
          isInternal: r.isInternal,
          isExternal: r.isExternal,
          publisherSlug: r.articlePublisherSlug,
          booksCount: r.booksCount,
        }
      : {
          key: `e${r.entryId}`,
          kind: r.kind,
          title: r.partTitle ?? "",
          entryId: r.entryId,
        },
  );
}

/** The save payload's items. Blank new lines are dropped, not errors. */
function toItems(rows: EditorRow[]): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const r of rows) {
    if (r.removed) continue;
    if (r.kind === "section") {
      if (r.entryId) items.push({ kind: "section", entryId: r.entryId });
      else if (r.articleId)
        items.push({ kind: "section", articleId: r.articleId });
      else if (r.title.trim())
        items.push({ kind: "section", title: r.title.trim() });
    } else if (r.entryId || r.title.trim()) {
      items.push({
        kind: r.kind,
        ...(r.entryId ? { entryId: r.entryId } : {}),
        title: r.title.trim(),
      });
    }
  }
  return items;
}

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

/**
 * The book's whole curriculum as one keyboard-driven outline, saved in a
 * single batch (`saveBookOutline`). Type a title to add a line; Enter starts
 * the next; Tab / Shift+Tab move a line between Part, Chapter and Section;
 * Alt+↑/↓ (or the ⠿ handle) reorder; pasting several lines — a markdown
 * outline, a nested list, a copied table of contents — adds them all.
 * Section slugs are derived from titles on save; nobody types one.
 *
 * Nothing is written until Save. The page remounts this component after a
 * save (its key changes), which resets local state to the saved outline. The
 * per-row Make standalone / Make internal actions write immediately, so they
 * are disabled while the outline has unsaved edits.
 */
export default function OutlineEditor({
  bookId,
  bookSlug,
  rows: savedRows,
  availableArticles,
  saveOutline,
  makeStandalone,
  absorb,
  borrow,
}: {
  bookId: number;
  bookSlug: string;
  rows: CurriculumRow[];
  availableArticles: AvailableArticle[];
  saveOutline: SaveAction;
  makeStandalone: ServerAction;
  absorb: ServerAction;
  /** The add-another-publisher's-article form (writes immediately). */
  borrow: React.ReactNode;
}) {
  const [rows, setRows] = useState<EditorRow[]>(() => fromSaved(savedRows));
  const [isPending, startTransition] = useTransition();
  const [panel, setPanel] = useState<null | "article" | "paste">(null);
  const [announcement, setAnnouncement] = useState("");
  /** Row to focus once the next render has put it in the DOM. */
  const pendingFocus = useRef<string | null>(null);
  const lastFocused = useRef<string | null>(null);
  const controls = useRef(new Map<string, HTMLElement>());
  const confirmRef = useRef<HTMLDialogElement>(null);
  // Stable across server and client: dnd-kit numbers its a11y ids with a
  // module counter otherwise, which differs between the two renders.
  const dndId = useId();

  const baseIds = useMemo(() => savedRows.map((r) => r.entryId), [savedRows]);
  const initialItems = useMemo(
    () => JSON.stringify(toItems(fromSaved(savedRows))),
    [savedRows],
  );
  const items = toItems(rows);
  const dirty = JSON.stringify(items) !== initialItems;

  // Move focus to a row once it exists in the DOM (after insert / remove).
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    const el = controls.current.get(key);
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement)
        el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [rows]);

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ── Mutations ──────────────────────────────────────────────────────────

  const focusAfterRender = (key: string) => {
    pendingFocus.current = key;
  };

  const update = (key: string, patch: Partial<EditorRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Insert after `afterKey` (or after the last focused line, else at the end). */
  function insertRows(newRows: EditorRow[], afterKey?: string | null) {
    if (newRows.length === 0) return;
    const anchor = afterKey === undefined ? lastFocused.current : afterKey;
    setRows((rs) => {
      const at = anchor ? rs.findIndex((r) => r.key === anchor) : -1;
      const i = at === -1 ? rs.length : at + 1;
      return [...rs.slice(0, i), ...newRows, ...rs.slice(i)];
    });
    focusAfterRender(newRows[newRows.length - 1].key);
  }

  const blank = (kind: OutlineKind): EditorRow => ({
    key: newKey(),
    kind,
    title: "",
  });
  const fromParsed = (p: ParsedOutlineItem[]): EditorRow[] =>
    p.map((x) => ({ key: newKey(), kind: x.kind, title: x.title }));

  function changeLevel(r: EditorRow, delta: 1 | -1): boolean {
    const to = LEVELS[LEVELS.indexOf(r.kind) + delta];
    if (!to || !canBecome(r, to)) return false;
    update(r.key, { kind: to });
    setAnnouncement(
      `${r.title || "Line"}: now a ${KIND_LABEL[to].toLowerCase()}`,
    );
    return true;
  }

  function move(index: number, delta: 1 | -1) {
    const to = index + delta;
    if (to < 0 || to >= rows.length) return;
    setRows((rs) => arrayMove(rs, index, to));
    setAnnouncement(`Moved to position ${to + 1} of ${rows.length}`);
  }

  function removeRow(r: EditorRow) {
    if (isNewRow(r)) {
      const i = rows.findIndex((x) => x.key === r.key);
      setRows((rs) => rs.filter((x) => x.key !== r.key));
      const prev = rows[i - 1] ?? rows[i + 1];
      if (prev) focusAfterRender(prev.key);
    } else {
      update(r.key, { removed: !r.removed });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((rs) => {
      const from = rs.findIndex((r) => r.key === active.id);
      const to = rs.findIndex((r) => r.key === over.id);
      return from === -1 || to === -1 ? rs : arrayMove(rs, from, to);
    });
  }

  // ── Keyboard ───────────────────────────────────────────────────────────

  function onLineKeyDown(e: React.KeyboardEvent<HTMLElement>, index: number) {
    const r = rows[index];
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const delta = e.key === "ArrowUp" ? -1 : 1;
      if (e.altKey) move(index, delta);
      else {
        const next = rows[index + delta];
        if (next) controls.current.get(next.key)?.focus();
      }
      e.preventDefault();
    } else if (e.key === "Tab" && !mod && !e.altKey) {
      // Outliner convention; only captured when the level can actually change,
      // so Tab still leaves the outline from a line that cannot.
      if (changeLevel(r, e.shiftKey ? -1 : 1)) e.preventDefault();
    } else if (e.key === "Enter" && !mod) {
      e.preventDefault();
      if (isTitleEditable(r) && !r.title.trim()) return;
      insertRows([blank(levelAfter(r.kind))], r.key);
    } else if (
      e.key === "Backspace" &&
      isNewRow(r) &&
      !r.articleId &&
      r.title === ""
    ) {
      e.preventDefault();
      removeRow(r);
    } else if (e.key === "Escape") {
      (e.currentTarget as HTMLElement).blur();
    }
  }

  function onLinePaste(
    e: React.ClipboardEvent<HTMLInputElement>,
    r: EditorRow,
  ) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\n")) return;
    const parsed = fromParsed(parseOutline(text));
    if (parsed.length === 0) return;
    e.preventDefault();
    if (isNewRow(r) && !r.articleId && r.title === "") {
      // Pasting into an empty fresh line replaces it.
      setRows((rs) => {
        const i = rs.findIndex((x) => x.key === r.key);
        return [...rs.slice(0, i), ...parsed, ...rs.slice(i + 1)];
      });
      focusAfterRender(parsed[parsed.length - 1].key);
    } else {
      insertRows(parsed, r.key);
    }
    setAnnouncement(`Added ${parsed.length} lines`);
  }

  // ── Save ───────────────────────────────────────────────────────────────

  const removals = rows.filter((r) => r.removed);
  const deletions = removals.filter(
    (r) => r.kind === "section" && r.isInternal,
  );

  function requestSave() {
    if (!dirty || isPending) return;
    if (removals.length > 0) confirmRef.current?.showModal();
    else save();
  }

  function save() {
    confirmRef.current?.close();
    const formData = new FormData();
    formData.set("payload", JSON.stringify({ bookId, baseIds, items }));
    startTransition(async () => {
      try {
        const result = await saveOutline(formData);
        if (result && "error" in result)
          toastError(result.error, "Outline not saved");
        else toast("Outline saved.", { title: "Saved", variant: "success" });
      } catch {
        toastError(
          "Something went wrong — please try again.",
          "Outline not saved",
        );
      }
    });
  }

  // ── Derived display ────────────────────────────────────────────────────

  const display = useMemo(
    () => layoutRows(rows, availableArticles),
    [rows, availableArticles],
  );

  const inOutline = new Set(
    rows.filter((r) => !r.removed && r.articleId).map((r) => r.articleId),
  );

  return (
    <div
      className="mb-6"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          requestSave();
        }
      }}
    >
      <p className="ps-outline-hint text-xs themed-muted mb-3">
        Type to add a line · <kbd>Enter</kbd> next line · <kbd>Tab</kbd> /{" "}
        <kbd>Shift</kbd>+<kbd>Tab</kbd> section ↔ chapter ↔ part ·{" "}
        <kbd>Alt</kbd>+<kbd>↑↓</kbd> move · paste a list to add many at once.
      </p>

      {rows.length === 0 ? (
        <EmptyOutline onStart={(r) => insertRows(r, null)} />
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rows.map((r) => r.key)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="border-t themed-border" aria-label="Book outline">
              {rows.map((r, i) => {
                const { depth, number, slugPreview } = display[i];
                const editable = isTitleEditable(r);
                const ref = (el: HTMLElement | null) => {
                  if (el) controls.current.set(r.key, el);
                  else controls.current.delete(r.key);
                };
                const common = {
                  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) =>
                    onLineKeyDown(e, i),
                  onFocus: () => (lastFocused.current = r.key),
                };
                return (
                  <OutlineRow
                    key={r.key}
                    id={r.key}
                    label={r.title || KIND_LABEL[r.kind]}
                    kind={r.kind}
                    removed={r.removed}
                  >
                    <span className="ps-outline-marker" aria-hidden>
                      {r.kind === "section"
                        ? number
                          ? String(number).padStart(2, "0")
                          : ""
                        : KIND_LABEL[r.kind]}
                    </span>

                    <div
                      className="ps-outline-main"
                      style={{ paddingLeft: `${depth * 1.25}rem` }}
                    >
                      {editable ? (
                        <input
                          ref={ref}
                          {...common}
                          value={r.title}
                          disabled={r.removed}
                          maxLength={200}
                          placeholder={
                            r.kind === "section"
                              ? "Untitled section"
                              : `Untitled ${r.kind}`
                          }
                          aria-label={`${KIND_LABEL[r.kind]} title`}
                          onChange={(e) =>
                            update(r.key, { title: e.target.value })
                          }
                          onPaste={(e) => onLinePaste(e, r)}
                          className="ps-outline-title"
                        />
                      ) : (
                        <span
                          ref={ref}
                          {...common}
                          tabIndex={0}
                          className="ps-outline-title"
                        >
                          {r.title}
                        </span>
                      )}
                      <RowMeta row={r} slugPreview={slugPreview} />
                    </div>

                    <div className="ps-outline-actions">
                      {r.entryId && r.kind === "section" && !r.removed && (
                        <SavedSectionActions
                          row={r}
                          bookId={bookId}
                          bookSlug={bookSlug}
                          disabled={dirty}
                          makeStandalone={makeStandalone}
                          absorb={absorb}
                        />
                      )}
                      <button
                        type="button"
                        className="ps-quiet-action"
                        onClick={() => removeRow(r)}
                        aria-label={`${r.removed ? "Keep" : "Remove"} ${r.title || KIND_LABEL[r.kind].toLowerCase()}`}
                      >
                        {r.removed
                          ? "Undo"
                          : r.kind === "section" && r.isExternal
                            ? "Unlink"
                            : "Remove"}
                      </button>
                    </div>
                  </OutlineRow>
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* ── Add ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap mt-4">
        <span className="ps-mono-micro themed-muted mr-1">Add</span>
        {LEVELS.map((k) => (
          <button
            key={k}
            type="button"
            className="ps-outline-add"
            onClick={() => insertRows([blank(k)])}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
        <button
          type="button"
          className="ps-outline-add"
          aria-expanded={panel === "article"}
          data-active={panel === "article" || undefined}
          onClick={() => setPanel(panel === "article" ? null : "article")}
        >
          Existing article
        </button>
        <button
          type="button"
          className="ps-outline-add"
          aria-expanded={panel === "paste"}
          data-active={panel === "paste" || undefined}
          onClick={() => setPanel(panel === "paste" ? null : "paste")}
        >
          Paste outline
        </button>
      </div>

      {panel === "article" && (
        <ArticlePicker
          articles={availableArticles.filter((a) => !inOutline.has(a.id))}
          onPick={(a) =>
            insertRows([
              {
                key: newKey(),
                kind: "section",
                title: a.title,
                articleId: a.id,
                slug: a.slug,
              },
            ])
          }
        />
      )}
      {panel === "paste" && (
        <PastePanel
          onAdd={(parsed) => {
            insertRows(fromParsed(parsed));
            setPanel(null);
          }}
        />
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs themed-muted select-none">
          Add an article from another publisher
        </summary>
        <div
          className="mt-3 rounded-lg border themed-border p-4"
          style={{ background: "var(--surface)" }}
        >
          {dirty ? (
            <p className="text-xs themed-muted">
              Save or discard your outline changes first — this adds the article
              right away.
            </p>
          ) : (
            borrow
          )}
        </div>
      </details>

      {/* ── Save bar ────────────────────────────────────────────────────── */}
      {dirty && (
        <div className="ps-outline-savebar">
          <span className="text-xs themed-muted flex-1 min-w-0">
            Unsaved changes
            {removals.length > 0 ? ` · ${removals.length} to remove` : ""}
          </span>
          <button
            type="button"
            onClick={() => setRows(fromSaved(savedRows))}
            disabled={isPending}
            className="themed-btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
          >
            Discard changes
          </button>
          <button
            type="button"
            onClick={requestSave}
            disabled={isPending}
            className="themed-btn-accent rounded-lg text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save outline"}
          </button>
        </div>
      )}

      <dialog
        ref={confirmRef}
        className="ps-confirm-dialog"
        aria-label="Confirm removals"
        onClick={(e) => {
          if (e.target === confirmRef.current) confirmRef.current?.close();
        }}
      >
        <p className="ps-confirm-label">
          Remove{" "}
          {removals.length === 1 ? "1 entry" : `${removals.length} entries`}
        </p>
        <div className="ps-confirm-body">
          {deletions.length > 0 && (
            <p>
              <strong>Permanently deleted</strong> (internal sections — their
              writing exists only in this book):{" "}
              {deletions.map((r) => r.title).join(", ")}.
            </p>
          )}
          {removals.length > deletions.length && (
            <p className={deletions.length > 0 ? "mt-2" : ""}>
              Leaving the book (nothing else is deleted):{" "}
              {removals
                .filter((r) => !deletions.includes(r))
                .map((r) => r.title || KIND_LABEL[r.kind])
                .join(", ")}
              .
            </p>
          )}
        </div>
        <div className="ps-confirm-actions">
          <button
            type="button"
            className="themed-btn-outline rounded-lg"
            onClick={() => confirmRef.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className={
              deletions.length > 0
                ? "themed-btn-danger rounded-lg"
                : "themed-btn-accent rounded-lg"
            }
            onClick={save}
          >
            Save outline
          </button>
        </div>
      </dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * Per-row display: indent by actual containment (a chapter sits under a part
 * only if one is open), the running section number, and the URL a new
 * section will get — final slugs are settled on save.
 */
function layoutRows(rows: EditorRow[], availableArticles: AvailableArticle[]) {
  const taken = new Set(rows.flatMap((r) => (r.slug ? [r.slug] : [])));
  for (const a of availableArticles)
    if (rows.some((r) => r.articleId === a.id)) taken.add(a.slug);
  let inPart = false;
  let inChapter = false;
  let n = 0;
  return rows.map((r) => {
    let depth = 0;
    let number: number | null = null;
    let slugPreview: string | null = null;
    if (!r.removed) {
      if (r.kind === "part") {
        inPart = true;
        inChapter = false;
      } else if (r.kind === "chapter") {
        depth = inPart ? 1 : 0;
        inChapter = true;
      } else {
        depth = (inPart ? 1 : 0) + (inChapter ? 1 : 0);
        number = ++n;
      }
      if (
        r.kind === "section" &&
        !r.entryId &&
        !r.articleId &&
        r.title.trim()
      ) {
        slugPreview = uniqueSlug(sectionSlugBase(r.title), taken);
      }
    }
    return { depth, number, slugPreview };
  });
}

/**
 * Sortable line. A fixed grid — handle · marker · title · actions — so markers
 * and handles stay in their columns while only the title indents with depth.
 */
function OutlineRow({
  id,
  label,
  kind,
  removed,
  children,
}: {
  id: string;
  label: string;
  kind: OutlineKind;
  removed?: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      className="ps-outline-row"
      data-kind={kind}
      data-removed={removed || undefined}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="ps-outline-handle"
        aria-label={`Drag to reorder: ${label}`}
        {...attributes}
        {...listeners}
        tabIndex={-1}
      >
        <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden>
          {[3, 8, 13].flatMap((y) =>
            [2.5, 7.5].map((x) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.25" />
            )),
          )}
        </svg>
      </button>
      {children}
    </li>
  );
}

/**
 * Trailing facts on a section line, in the mono voice: its URL slug, and a
 * pill only for the exceptions (a section in a book is internal by default).
 */
function RowMeta({
  row: r,
  slugPreview,
}: {
  row: EditorRow;
  slugPreview: string | null;
}) {
  if (r.kind !== "section") return null;
  const isNewSection = !r.entryId && !r.articleId;
  const slug = isNewSection ? slugPreview : r.slug;
  const pill = isNewSection
    ? "new"
    : !r.entryId
      ? "adding"
      : r.isExternal
        ? `@${r.publisherSlug}`
        : !r.isInternal
          ? "standalone"
          : null;
  if (!slug && !pill) return null;
  return (
    <span className="ps-outline-meta">
      {slug && (
        <span
          className="ps-outline-slug"
          title={
            isNewSection
              ? "Made from the title; settled when you save"
              : "URL slug"
          }
        >
          {slug.replace(/^article-/, "")}
        </span>
      )}
      {pill && (
        <span className="ps-status-pill ps-mono-micro themed-muted">
          {pill}
        </span>
      )}
    </span>
  );
}

/** Immediate per-section actions (they change the article, not the outline). */
function SavedSectionActions({
  row: r,
  bookId,
  bookSlug,
  disabled,
  makeStandalone,
  absorb,
}: {
  row: EditorRow;
  bookId: number;
  bookSlug: string;
  disabled: boolean;
  makeStandalone: ServerAction;
  absorb: ServerAction;
}) {
  const edit = !r.isExternal && r.publisherSlug && (
    <Link
      href={`/${r.publisherSlug}/articles/${r.slug}/edit${r.isInternal ? `?book=${encodeURIComponent(bookSlug)}` : ""}`}
      className="ps-quiet-action"
      aria-label={`Edit ${r.title}`}
    >
      Edit
    </Link>
  );
  if (r.isInternal) {
    return (
      <>
        {edit}
        <ToastForm action={makeStandalone} errorTitle="Not changed">
          <input type="hidden" name="articleId" value={r.articleId} />
          <ConfirmButton
            title="Make standalone"
            message="This gives the section its own public /articles URL and lists it in search and the sitemap. It stays in this book but is no longer deleted along with it."
            confirmLabel="Make standalone"
            disabled={disabled}
            className="ps-quiet-action"
          >
            Make standalone
          </ConfirmButton>
        </ToastForm>
      </>
    );
  }
  if (r.isExternal) return null;
  if ((r.booksCount ?? 1) > 1) {
    return (
      <>
        {edit}
        <span
          className="text-xs themed-muted px-2 py-1"
          title="This article is used in other books. Remove it from those books first to make it internal to this one."
        >
          in {r.booksCount} books
        </span>
      </>
    );
  }
  return (
    <>
      {edit}
      <ToastForm action={absorb} errorTitle="Not changed">
        <input type="hidden" name="articleId" value={r.articleId} />
        <input type="hidden" name="bookId" value={bookId} />
        <ConfirmButton
          title="Make internal"
          message="This makes the article internal to this book: its public /articles URL stops working, it leaves your standalone list, search and the sitemap, and it is deleted if this book is deleted."
          confirmLabel="Make internal"
          danger
          disabled={disabled}
          className="ps-quiet-action"
        >
          Make internal
        </ConfirmButton>
      </ToastForm>
    </>
  );
}

/** First-run state: one big box that takes a typed or pasted outline. */
function EmptyOutline({ onStart }: { onStart: (rows: EditorRow[]) => void }) {
  const [text, setText] = useState("");
  const parsed = parseOutline(text);
  return (
    <div
      className="rounded-lg border themed-border p-4"
      style={{ background: "var(--surface)" }}
    >
      <label
        htmlFor="outline-start"
        className="block text-sm font-medium themed-secondary mb-1"
      >
        Sketch the book
      </label>
      <p className="text-xs themed-muted mb-2">
        One line per section. <code># Part</code> and <code>## Chapter</code>{" "}
        headings, or an indented list, group them. Paste a table of contents
        straight in.
      </p>
      <textarea
        id="outline-start"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          "# Foundations\n## Sets\nWhat is a set?\nSubsets and power sets\n## Functions\nInjective and surjective maps"
        }
        className="themed-input font-mono"
        style={{ fontSize: "0.8125rem" }}
      />
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <button
          type="button"
          className="themed-btn-accent rounded-lg text-sm"
          disabled={parsed.length === 0}
          onClick={() =>
            onStart(
              parsed.map((p) => ({
                key: newKey(),
                kind: p.kind,
                title: p.title,
              })),
            )
          }
        >
          Use this outline
        </button>
        <span className="text-xs themed-muted">{summarize(parsed)}</span>
      </div>
    </div>
  );
}

/** "Paste outline" panel for an outline that already has lines. */
function PastePanel({
  onAdd,
}: {
  onAdd: (parsed: ParsedOutlineItem[]) => void;
}) {
  const [text, setText] = useState("");
  const parsed = parseOutline(text);
  return (
    <div
      className="mt-3 rounded-lg border themed-border p-4"
      style={{ background: "var(--surface)" }}
    >
      <textarea
        rows={6}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Outline to add"
        placeholder={"## Chapter title\nSection one\nSection two"}
        className="themed-input font-mono"
        style={{ fontSize: "0.8125rem" }}
      />
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <button
          type="button"
          className="themed-btn-accent rounded-lg text-sm"
          disabled={parsed.length === 0}
          onClick={() => onAdd(parsed)}
        >
          Add to outline
        </button>
        <span className="text-xs themed-muted">
          {summarize(parsed)} · added after the line you were on
        </span>
      </div>
    </div>
  );
}

function summarize(parsed: ParsedOutlineItem[]): string {
  if (parsed.length === 0) return "Nothing to add yet";
  const count = (k: OutlineKind) => parsed.filter((p) => p.kind === k).length;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return [
    count("part") && plural(count("part"), "part"),
    count("chapter") && plural(count("chapter"), "chapter"),
    count("section") && plural(count("section"), "section"),
  ]
    .filter(Boolean)
    .join(", ");
}

/** Type-to-filter picker over the publisher's standalone articles. */
function ArticlePicker({
  articles,
  onPick,
}: {
  articles: AvailableArticle[];
  onPick: (a: AvailableArticle) => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const matches = articles
    .filter(
      (a) =>
        !needle ||
        a.title.toLowerCase().includes(needle) ||
        a.slug.includes(needle),
    )
    .slice(0, 8);
  return (
    <div
      className="mt-3 rounded-lg border themed-border p-4"
      style={{ background: "var(--surface)" }}
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) {
            e.preventDefault();
            onPick(matches[0]);
            setQ("");
          }
        }}
        placeholder="Search your articles…"
        aria-label="Search your standalone articles"
        className="themed-input text-sm"
      />
      {articles.length === 0 ? (
        <p className="text-xs themed-muted mt-2">
          All of your standalone articles are already in this book.
        </p>
      ) : (
        <ul className="mt-2">
          {matches.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onPick(a)}
                className="w-full text-left px-2 py-1.5 rounded-md text-sm ps-outline-pick flex items-baseline gap-2"
              >
                <span className="themed-heading truncate">{a.title}</span>
                <span className="ps-mono-meta themed-muted shrink-0">
                  {a.slug}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="text-xs themed-muted px-2 py-1.5">No match.</li>
          )}
        </ul>
      )}
    </div>
  );
}
