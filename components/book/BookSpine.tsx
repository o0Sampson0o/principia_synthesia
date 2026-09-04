"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  dividerHref,
  sectionHref,
  type BookChild,
  type ChapterNode,
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Native <dialog>: showModal() gives us the top layer, focus trap and Esc for
  // free. Styles live in globals.css — Tailwind utilities on <dialog> lose to
  // the unlayered rules there.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const tree = (
    <BookTree
      publisherSlug={publisherSlug}
      bookSlug={bookSlug}
      nodes={nodes}
      pathname={pathname}
    />
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
      <aside className="ps-spine" aria-label="Book contents">
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

/* ── Tree ─────────────────────────────────────────────────────────────────── */

function BookTree({
  publisherSlug,
  bookSlug,
  nodes,
  pathname,
}: {
  publisherSlug: string;
  bookSlug: string;
  nodes: BookChild[];
  pathname: string;
}) {
  return (
    <ol className="ps-spine-tree">
      {nodes.map((node, i) => (
        <SpineNode
          key={`${node.kind}-${node.slug}-${i}`}
          node={node}
          publisherSlug={publisherSlug}
          bookSlug={bookSlug}
          pathname={pathname}
        />
      ))}
    </ol>
  );
}

function SpineNode({
  node,
  publisherSlug,
  bookSlug,
  pathname,
}: {
  node: BookChild;
  publisherSlug: string;
  bookSlug: string;
  pathname: string;
}) {
  if (node.kind === "section") {
    return (
      <li className="ps-spine-loose">
        <SpineSection
          node={node}
          publisherSlug={publisherSlug}
          bookSlug={bookSlug}
          pathname={pathname}
        />
      </li>
    );
  }

  if (node.kind === "chapter") {
    return (
      <li className="ps-spine-chapter">
        <SpineChapter
          node={node}
          publisherSlug={publisherSlug}
          bookSlug={bookSlug}
          pathname={pathname}
        />
      </li>
    );
  }

  return (
    <li className="ps-spine-part">
      <Link href={dividerHref(publisherSlug, bookSlug, node)} className="ps-spine-part-label">
        {node.title}
      </Link>
      <ol className="ps-spine-tree">
        {node.children.map((child, i) =>
          child.kind === "chapter" ? (
            <li className="ps-spine-chapter" key={`c-${child.slug}-${i}`}>
              <SpineChapter
                node={child}
                publisherSlug={publisherSlug}
                bookSlug={bookSlug}
                pathname={pathname}
              />
            </li>
          ) : (
            <li key={`s-${child.slug}-${i}`}>
              <SpineSection
                node={child}
                publisherSlug={publisherSlug}
                bookSlug={bookSlug}
                pathname={pathname}
              />
            </li>
          )
        )}
      </ol>
    </li>
  );
}

function SpineChapter({
  node,
  publisherSlug,
  bookSlug,
  pathname,
}: {
  node: ChapterNode;
  publisherSlug: string;
  bookSlug: string;
  pathname: string;
}) {
  return (
    <>
      <Link href={dividerHref(publisherSlug, bookSlug, node)} className="ps-spine-chapter-label">
        {node.title}
      </Link>
      {node.children.length > 0 && (
        <ol className="ps-spine-sections">
          {node.children.map((s, i) => (
            <li key={`${s.slug}-${i}`}>
              <SpineSection
                node={s}
                publisherSlug={publisherSlug}
                bookSlug={bookSlug}
                pathname={pathname}
              />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function SpineSection({
  node,
  publisherSlug,
  bookSlug,
  pathname,
}: {
  node: SectionNode;
  publisherSlug: string;
  bookSlug: string;
  pathname: string;
}) {
  const href = sectionHref(publisherSlug, bookSlug, node.slug);

  // resolvePath keys off the LAST URL segment, so a section is current whenever
  // the path ends with its slug — which correctly matches every accepted shape
  // (/book/slug, /book/part/slug, /book/part/chapter/slug).
  const last = decodeURIComponent(pathname.split("?")[0].replace(/\/+$/, "").split("/").pop() ?? "");
  const current = last === node.slug;

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
