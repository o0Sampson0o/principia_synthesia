"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  dividerHref,
  sectionHref,
  type BookChild,
  type ChapterNode,
  type PartNode,
  type SectionNode,
  // lib/book-nav, NOT lib/book-structure: this is a client component and that
  // module imports `db`, which would pull the postgres driver into the browser.
} from "@/lib/book-nav";

/**
 * The book's persistent contents tree — a book's own structure, standing beside
 * its prose rather than on a separate page.
 *
 * Client, for two reasons that genuinely need the browser: the current section
 * comes from `usePathname()` (a layout never receives the catch-all `section`
 * param, so the server cannot know it), and the narrow-screen drawer needs open
 * state. The tree itself arrives as plain serialisable data from the layout.
 *
 * Labels: this is "Book contents". An article's own headings are "Sections"
 * (ArticleToc, and the margin rail) — the two must never share a word, or a
 * narrow screen shows what reads as the same list twice.
 */
export default function BookSpine({
  publisherSlug,
  bookSlug,
  bookTitle,
  bookHref,
  nodes,
  sectionCount,
  partCount,
}: {
  publisherSlug: string;
  bookSlug: string;
  bookTitle: string;
  bookHref: string;
  nodes: BookChild[];
  sectionCount: number;
  partCount: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const fold = useChapterFold(publisherSlug, bookSlug, pathname);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // A deep link into a long book, or a page turn past the visible part of the
  // tree, would otherwise leave the current section scrolled out of sight. The
  // layout persists across navigations, so a click inside the tree that is
  // already in view moves nothing.
  useEffect(() => {
    if (asideRef.current) revealCurrent(asideRef.current);
  }, [pathname]);

  // Native <dialog>: showModal() gives us the top layer, focus trap and Esc for
  // free. Styles live in globals.css — Tailwind utilities on <dialog> lose to
  // the unlayered rules there.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      if (panelRef.current) revealCurrent(panelRef.current);
    }
    if (!open && el.open) el.close();
  }, [open]);

  const tree = (
    <SpineContext.Provider value={fold}>
      <ol className="ps-spine-tree">
        {nodes.map((node, i) => (
          <SpineNode key={`${node.kind}-${node.slug}-${i}`} node={node} />
        ))}
      </ol>
    </SpineContext.Provider>
  );

  const head = (
    <div className="ps-spine-head">
      <p className="ps-eyebrow-muted">Book contents</p>
      <Link href={bookHref} className="ps-spine-title">
        {bookTitle}
      </Link>
      <p className="ps-spine-count">
        {partCount > 0 && `${partCount} ${partCount === 1 ? "part" : "parts"} · `}
        {sectionCount} {sectionCount === 1 ? "section" : "sections"}
      </p>
    </div>
  );

  return (
    <>
      {/* Wide: the spine itself. */}
      <aside ref={asideRef} className="ps-spine" aria-label="Book contents">
        {head}
        {tree}
      </aside>

      {/* Narrow: a trigger in the flow, and the same tree in a drawer. */}
      <button
        type="button"
        className="ps-spine-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden="true">☰</span> Book contents
      </button>

      <dialog
        ref={dialogRef}
        className="ps-spine-dialog"
        aria-label="Book contents"
        onClose={() => setOpen(false)}
        // Clicking the backdrop (the dialog element itself, outside its panel)
        // dismisses; clicks inside the panel stop at the panel.
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
      >
        {/* Following any link inside the drawer means the reader has arrived,
            so the drawer closes. Delegated here rather than run from a
            pathname effect, which would cascade a render on every nav. */}
        <div
          ref={panelRef}
          className="ps-spine-panel"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          <div className="ps-spine-panel-bar">
            {head}
            <button
              type="button"
              className="ps-spine-close"
              onClick={() => setOpen(false)}
              aria-label="Close book contents"
            >
              ✕
            </button>
          </div>
          {tree}
        </div>
      </dialog>
    </>
  );
}

/**
 * Scroll `scroller` so its current section sits a third of the way down, if it
 * is not already fully visible. Adjusts scrollTop directly: scrollIntoView
 * would also scroll the window, moving the page the reader is on.
 */
function revealCurrent(scroller: HTMLElement) {
  const current = scroller.querySelector('[aria-current="page"]');
  if (!current) return;
  const box = scroller.getBoundingClientRect();
  const item = current.getBoundingClientRect();
  if (item.top >= box.top && item.bottom <= box.bottom) return;
  scroller.scrollTop += item.top - box.top - box.height / 3;
}

/* ── Chapter folding ──────────────────────────────────────────────────────── */

/**
 * A reader's explicit open/closed choice for one chapter, and the section that
 * was current when they made it.
 */
type Fold = { open: boolean; at: string };

const FOLD_EVENT = "ps-spine-fold";

/** Where choices go when sessionStorage throws (private mode, blocked storage). */
const memoryFolds = new Map<string, string>();

function readFolds(key: string): string | null {
  try {
    return sessionStorage.getItem(key) ?? memoryFolds.get(key) ?? null;
  } catch {
    return memoryFolds.get(key) ?? null;
  }
}

/**
 * Which chapters are open. A chapter with no recorded choice is open exactly
 * when it holds the current section, so a long book reads as a list of
 * chapters with the reader's own one unfolded. A recorded choice wins — except
 * that a chapter closed from some other section reopens when the reader turns
 * into it, so the spine always shows where they are.
 *
 * Choices live in sessionStorage per book, so they survive a reload but not
 * the session. useSyncExternalStore reads them hydration-safely: the server
 * snapshot is "no choices", the same tree the server rendered.
 */
function useChapterFold(publisherSlug: string, bookSlug: string, pathname: string) {
  const storageKey = `ps-spine:${publisherSlug}/${bookSlug}`;

  const raw = useSyncExternalStore(
    (onChange) => {
      window.addEventListener(FOLD_EVENT, onChange);
      return () => window.removeEventListener(FOLD_EVENT, onChange);
    },
    () => readFolds(storageKey),
    () => null
  );

  const folds = useMemo<Record<string, Fold>>(() => {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [raw]);

  // resolvePath keys off the LAST URL segment, so a section is current whenever
  // the path ends with its slug — which correctly matches every accepted shape
  // (/book/slug, /book/part/slug, /book/part/chapter/slug).
  const currentSlug = decodeURIComponent(
    pathname.split("?")[0].replace(/\/+$/, "").split("/").pop() ?? ""
  );

  const isOpen = useCallback(
    (chapter: ChapterNode) => {
      const holdsCurrent = chapter.children.some((s) => s.slug === currentSlug);
      const fold = folds[chapter.slug];
      if (!fold) return holdsCurrent;
      if (holdsCurrent && !fold.open && fold.at !== currentSlug) return true;
      return fold.open;
    },
    [folds, currentSlug]
  );

  const toggle = useCallback(
    (chapter: ChapterNode) => {
      const next = { ...folds, [chapter.slug]: { open: !isOpen(chapter), at: currentSlug } };
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // The toggle still has to work: keep the choice for this page instead.
        memoryFolds.set(storageKey, JSON.stringify(next));
      }
      window.dispatchEvent(new Event(FOLD_EVENT));
    },
    [folds, isOpen, currentSlug, storageKey]
  );

  return { publisherSlug, bookSlug, currentSlug, isOpen, toggle };
}

type SpineState = ReturnType<typeof useChapterFold>;

const SpineContext = createContext<SpineState | null>(null);

function useSpine(): SpineState {
  const ctx = useContext(SpineContext);
  if (!ctx) throw new Error("Spine nodes must render inside BookSpine");
  return ctx;
}

/* ── Tree ─────────────────────────────────────────────────────────────────── */

function SpineNode({ node }: { node: BookChild }) {
  if (node.kind === "section") {
    return (
      <li className="ps-spine-loose">
        <SpineSection node={node} />
      </li>
    );
  }

  if (node.kind === "chapter") {
    return (
      <li className="ps-spine-chapter">
        <SpineChapter node={node} />
      </li>
    );
  }

  return <SpinePart node={node} />;
}

function SpinePart({ node }: { node: PartNode }) {
  const { publisherSlug, bookSlug } = useSpine();
  return (
    <li className="ps-spine-part">
      <Link href={dividerHref(publisherSlug, bookSlug, node)} className="ps-spine-part-label">
        {node.title}
      </Link>
      <ol className="ps-spine-tree">
        {node.children.map((child, i) =>
          child.kind === "chapter" ? (
            <li className="ps-spine-chapter" key={`c-${child.slug}-${i}`}>
              <SpineChapter node={child} />
            </li>
          ) : (
            <li key={`s-${child.slug}-${i}`}>
              <SpineSection node={child} />
            </li>
          )
        )}
      </ol>
    </li>
  );
}

/**
 * A chapter row: its title links to the chapter's contents page, and a
 * separate disclosure button folds its sections. Not a <details>: a link
 * inside <summary> nests a link in a button-role element, which assistive
 * technology announces badly and which splits one click into two meanings.
 */
function SpineChapter({ node }: { node: ChapterNode }) {
  const { publisherSlug, bookSlug, isOpen, toggle } = useSpine();
  const listId = useId();
  const open = isOpen(node);
  const hasSections = node.children.length > 0;

  return (
    <>
      <div className="ps-spine-chapter-row">
        <Link href={dividerHref(publisherSlug, bookSlug, node)} className="ps-spine-chapter-label">
          {node.title}
        </Link>
        {hasSections && (
          <button
            type="button"
            className="ps-spine-fold"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.title}`}
            onClick={() => toggle(node)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        )}
      </div>
      {hasSections && (
        <ol id={listId} className="ps-spine-sections" hidden={!open}>
          {node.children.map((s, i) => (
            <li key={`${s.slug}-${i}`}>
              <SpineSection node={s} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function SpineSection({ node }: { node: SectionNode }) {
  const { publisherSlug, bookSlug, currentSlug } = useSpine();
  const href = sectionHref(publisherSlug, bookSlug, node.slug);
  const current = currentSlug === node.slug;

  // A section owned by another publisher: the book assembled it rather than
  // wrote it, and it is not the book owner's to edit.
  const borrowed = node.publisherSlug !== null && node.publisherSlug !== publisherSlug;

  return (
    <Link href={href} className="ps-spine-section" aria-current={current ? "page" : undefined}>
      <span>{node.title}</span>
      {borrowed && (
        <span className="ps-spine-borrowed" title={`Contributed by @${node.publisherSlug}`}>
          Borrowed
        </span>
      )}
    </Link>
  );
}
