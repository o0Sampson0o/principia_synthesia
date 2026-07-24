import { notFound } from "next/navigation";
import Link from "next/link";
import { type ReactNode } from "react";
import { db } from "@/db";
import { books, bookCategories, categories } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { canEditContent } from "@/lib/roles";
import CommentThread from "@/components/CommentThread";
import {
  loadBookStructure,
  dividerHref,
  sectionHref,
  type SectionNode,
} from "@/lib/book-structure";

export default async function BookPage({
  params,
}: {
  params: Promise<{ publisher: string; bookSlug: string }>;
}) {
  const { publisher: publisherSlug, bookSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const [bookRow] = await db
    .select()
    .from(books)
    .where(and(eq(books.slug, bookSlug), eq(books.ownerType, ownerType), eq(books.ownerId, ownerId), isNull(books.deletedAt)))
    .limit(1);
  if (!bookRow) notFound();

  const session = await getSession();
  if (!(await canView({ type: "book", ownerType, ownerId, slug: bookSlug }, session))) notFound();

  const isEditor = await canEditContent(session, ownerType, ownerId);

  // Categories
  const bookCats = await db
    .select({ slug: categories.slug })
    .from(bookCategories)
    .innerJoin(categories, eq(bookCategories.categoryId, categories.id))
    .where(eq(bookCategories.bookId, bookRow.id));

  const structure = await loadBookStructure(bookRow.id);
  // Global 1-based section number across the whole book (dividers don't count).
  const sectionNo = new Map<string, number>();
  structure.orderedSections.forEach((s, i) => sectionNo.set(s.slug, i + 1));

  const sectionRow = (s: SectionNode) => {
    const isExternal = s.publisherSlug !== null && s.publisherSlug !== publisherSlug;
    return (
      <div key={`s-${s.slug}`} className="ps-content-row pl-8">
        <div className="flex items-baseline gap-3 w-full min-w-0">
          <span
            className="tabular-nums shrink-0"
            style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}
          >
            {String(sectionNo.get(s.slug) ?? 0).padStart(2, "0")}
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

  const dividerRow = (
    key: string,
    label: string,
    href: string,
    indent: boolean
  ) => (
    <div key={key} className={`ps-content-row ${indent ? "pl-4" : ""}`}>
      <Link href={href} className="ps-eyebrow-muted hover:text-[var(--foreground)] transition-colors">
        {label}
      </Link>
    </div>
  );

  const rows: ReactNode[] = [];
  for (const child of structure.children) {
    if (child.kind === "part") {
      rows.push(dividerRow(`p-${child.slug}`, child.title, dividerHref(publisherSlug, bookSlug, child), false));
      for (const c of child.children) {
        if (c.kind === "chapter") {
          rows.push(dividerRow(`ch-${c.slug}`, c.title, dividerHref(publisherSlug, bookSlug, c), true));
          for (const s of c.children) rows.push(sectionRow(s));
        } else {
          rows.push(sectionRow(c));
        }
      }
    } else if (child.kind === "chapter") {
      rows.push(dividerRow(`ch-${child.slug}`, child.title, dividerHref(publisherSlug, bookSlug, child), true));
      for (const s of child.children) rows.push(sectionRow(s));
    } else {
      rows.push(sectionRow(child));
    }
  }

  return (
    <main className="w-full max-w-4xl mx-auto px-5 py-12 sm:py-16">

      {/* ── Header ── */}
      <Link href={`/${publisherSlug}`} className="ps-eyebrow inline-block mb-6 hover:opacity-70 transition-opacity">
        {pub.displayName}
      </Link>

      <div className="mb-10">
        <h1 className="ps-display themed-heading mb-4" style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}>
          {bookRow.title}
        </h1>
        {bookRow.summary && (
          <p className="themed-muted" style={{ fontSize: "1.0625rem", lineHeight: 1.7 }}>
            {bookRow.summary}
          </p>
        )}
        {bookCats.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-5">
            {bookCats.map((c) => (
              <Link key={c.slug} href={`/search?tags=${encodeURIComponent(c.slug)}`} className="themed-tag">
                #{c.slug}
              </Link>
            ))}
          </div>
        )}
        {isEditor && (
          <div className="ps-action-bar mt-5">
            <Link href={`/${publisherSlug}/books/${bookSlug}/edit`} className="themed-btn-outline" style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem" }}>
              Edit
            </Link>
            <Link href={`/${publisherSlug}/books/${bookSlug}/access`} className="themed-btn-outline" style={{ fontSize: "0.8125rem", padding: "0.3rem 0.75rem" }}>
              Access
            </Link>
            <Link href={`/api/publishers/${publisherSlug}/books/${bookSlug}/export/pdf`} className="themed-btn-ghost" style={{ fontSize: "0.8125rem" }}>
              PDF
            </Link>
            <Link href={`/api/publishers/${publisherSlug}/books/${bookSlug}/export/epub`} className="themed-btn-ghost" style={{ fontSize: "0.8125rem" }}>
              EPUB
            </Link>
            <Link href={`/api/publishers/${publisherSlug}/books/${bookSlug}/export/bundle`} className="themed-btn-ghost" style={{ fontSize: "0.8125rem" }}>
              Bundle
            </Link>
          </div>
        )}
      </div>

      <hr className="themed-hr" />

      {/* ── Contents ── */}
      {rows.length === 0 ? (
        <p className="themed-muted mt-8" style={{ fontSize: "0.9375rem" }}>No sections yet.</p>
      ) : (
        <div className="ps-content-box mt-0 border-t-0 rounded-none rounded-b-lg">{rows}</div>
      )}

      {/* ── Book discussion ──────────────────────────────────────── */}
      <CommentThread
        publisherSlug={publisherSlug}
        subject={{ kind: "book", slug: bookSlug }}
        subjectId={{ bookId: bookRow.id }}
        ownerType={ownerType}
        ownerId={ownerId}
        session={session}
      />

    </main>
  );
}
