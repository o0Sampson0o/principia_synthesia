import Link from "next/link";
import { type ReactNode } from "react";
import BookBreadcrumb, { type Crumb } from "@/components/book/BookBreadcrumb";
import {
  dividerHref,
  sectionHref,
  type ChapterNode,
  type PartNode,
  type SectionNode,
} from "@/lib/book-structure";

/**
 * On-the-fly Table of Contents for a Part or Chapter, computed from the book
 * structure. A Part lists its chapters (each linking to its own TOC) with their
 * sections, plus any sections that sit directly under the part; a Chapter lists
 * its sections.
 */
export default function BookDividerToc({
  publisherSlug,
  bookSlug,
  bookTitle,
  node,
  part,
}: {
  publisherSlug: string;
  bookSlug: string;
  bookTitle: string;
  node: PartNode | ChapterNode;
  part: PartNode | null;
}) {
  const crumbs: Crumb[] = [
    { label: `@${publisherSlug}`, href: `/${publisherSlug}` },
    { label: bookTitle, href: `/${publisherSlug}/books/${bookSlug}` },
  ];
  if (node.kind === "chapter" && part) {
    crumbs.push({ label: part.title, href: dividerHref(publisherSlug, bookSlug, part) });
  }
  crumbs.push({ label: node.title }); // current page

  let no = 0;
  const sectionRow = (s: SectionNode) => {
    no += 1;
    const isExternal = s.publisherSlug !== null && s.publisherSlug !== publisherSlug;
    return (
      <div key={`s-${s.slug}`} className="ps-content-row pl-8">
        <div className="flex items-baseline gap-3 w-full min-w-0">
          <span
            className="tabular-nums shrink-0"
            style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}
          >
            {String(no).padStart(2, "0")}
          </span>
          <Link
            href={sectionHref(publisherSlug, bookSlug, s.slug)}
            className="ps-list-link flex-1 min-w-0"
          >
            {s.title}
          </Link>
          {isExternal && (
            <span className="themed-muted shrink-0" style={{ fontSize: "0.75rem" }}>
              <Link
                href={`/${s.publisherSlug}`}
                className="themed-nav-link hover:text-[var(--foreground)] transition-colors"
              >
                @{s.publisherSlug}
              </Link>
            </span>
          )}
        </div>
      </div>
    );
  };

  const rows: ReactNode[] = [];
  if (node.kind === "part") {
    for (const child of node.children) {
      if (child.kind === "chapter") {
        rows.push(
          <div key={`ch-${child.slug}`} className="ps-content-row pl-4">
            <Link
              href={dividerHref(publisherSlug, bookSlug, child)}
              className="ps-eyebrow-muted hover:text-[var(--foreground)] transition-colors"
            >
              {child.title}
            </Link>
          </div>
        );
        for (const s of child.children) rows.push(sectionRow(s));
      } else {
        rows.push(sectionRow(child));
      }
    }
  } else {
    for (const s of node.children) rows.push(sectionRow(s));
  }

  return (
    <main className="w-full max-w-4xl mx-auto px-5 py-12 sm:py-16">
      <div className="mb-6">
        <BookBreadcrumb crumbs={crumbs} />
      </div>

      <div className="mb-10">
        <p className="ps-eyebrow-muted mb-2">{node.kind === "part" ? "Part" : "Chapter"}</p>
        <h1
          className="ps-display themed-heading"
          style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
        >
          {node.title}
        </h1>
      </div>

      <hr className="themed-hr" />

      {rows.length === 0 ? (
        <p className="themed-muted mt-8" style={{ fontSize: "0.9375rem" }}>
          No sections yet.
        </p>
      ) : (
        <div className="ps-content-box mt-0 border-t-0 rounded-none rounded-b-lg">{rows}</div>
      )}
    </main>
  );
}
