import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { articles, books, comments } from "@/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { resolvePublisher } from "@/lib/publisher";
import { canEditContent } from "@/lib/roles";
import type { CommentSubject } from "@/lib/validations";
import { deleteComment, moderateComment, setGuestModeration } from "./actions";
import ConfirmButton from "@/components/ConfirmButton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueueRow {
  id: number;
  authorName: string;
  body: string;
  status: string;
  createdAt: Date;
  subject: CommentSubject;
  subjectTitle: string;
  subjectHref: string | null;
}

const monoMeta = {
  fontSize: "0.6875rem",
  fontFamily: "ui-monospace, monospace",
  letterSpacing: "0.05em",
} as const;

// ---------------------------------------------------------------------------
// Moderation queue (publisher editors only)
// ---------------------------------------------------------------------------

export default async function CommentsModerationPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();
  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const session = await requireSession();
  if (!(await canEditContent(session, ownerType, ownerId))) notFound();

  // Pending + spam comments on this publisher's articles (incl. chapters)…
  const articleRows = await db
    .select({
      id: comments.id,
      guestName: comments.guestName,
      body: comments.body,
      status: comments.status,
      createdAt: comments.createdAt,
      articleSlug: articles.slug,
      articleTitle: articles.title,
      isInternal: articles.isInternal,
      parentBookSlug: books.slug,
    })
    .from(comments)
    .innerJoin(
      articles,
      and(
        eq(comments.articleId, articles.id),
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        isNull(articles.deletedAt)
      )
    )
    .leftJoin(books, and(eq(articles.parentBookId, books.id), isNull(books.deletedAt)))
    .where(and(inArray(comments.status, ["pending", "spam"]), isNull(comments.deletedAt)))
    .orderBy(desc(comments.createdAt));

  // …and on this publisher's books.
  const bookRows = await db
    .select({
      id: comments.id,
      guestName: comments.guestName,
      body: comments.body,
      status: comments.status,
      createdAt: comments.createdAt,
      bookSlug: books.slug,
      bookTitle: books.title,
    })
    .from(comments)
    .innerJoin(
      books,
      and(
        eq(comments.bookId, books.id),
        eq(books.ownerType, ownerType),
        eq(books.ownerId, ownerId),
        isNull(books.deletedAt)
      )
    )
    .where(and(inArray(comments.status, ["pending", "spam"]), isNull(comments.deletedAt)))
    .orderBy(desc(comments.createdAt));

  const rows: QueueRow[] = [
    ...articleRows.map((r) => ({
      id: r.id,
      authorName: r.guestName ?? "Guest",
      body: r.body,
      status: r.status,
      createdAt: r.createdAt,
      subject: { kind: "article", slug: r.articleSlug } as CommentSubject,
      subjectTitle: r.articleTitle,
      subjectHref: r.isInternal
        ? r.parentBookSlug
          ? `/${publisherSlug}/books/${r.parentBookSlug}/${r.articleSlug}`
          : null
        : `/${publisherSlug}/articles/${r.articleSlug}`,
    })),
    ...bookRows.map((r) => ({
      id: r.id,
      authorName: r.guestName ?? "Guest",
      body: r.body,
      status: r.status,
      createdAt: r.createdAt,
      subject: { kind: "book", slug: r.bookSlug } as CommentSubject,
      subjectTitle: r.bookTitle,
      subjectHref: `/${publisherSlug}/books/${r.bookSlug}`,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const boundSetModeration = setGuestModeration.bind(null, publisherSlug);

  return (
    <main className="w-full max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-16">
      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-8 mb-10">
        <div>
          <p className="ps-eyebrow mb-3">@{publisherSlug}</p>
          <h1
            className="ps-display themed-heading"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
          >
            Comment moderation
          </h1>
        </div>
        <div className="shrink-0 text-right">
          <p
            className="themed-heading"
            style={{
              fontFamily: "var(--font-playfair), serif",
              fontSize: "clamp(2rem, 4vw, 3rem)",
              fontWeight: 500,
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            {pendingCount}
          </p>
          <p
            className="themed-muted mt-1"
            style={{
              fontSize: "0.5625rem",
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            awaiting review
          </p>
        </div>
      </div>

      {/* ── Guest policy — settings row ──────────────────────────── */}
      <div
        className="flex items-center justify-between gap-4 flex-wrap rounded-lg border themed-border px-4 py-3.5 mb-12"
        style={{ background: "var(--surface)" }}
      >
        <div>
          <p className="text-sm font-medium themed-heading">Guest comments</p>
          <p className="themed-muted mt-0.5" style={{ fontSize: "0.8125rem" }}>
            {pub.allowUnmoderatedGuests
              ? "Post immediately, without review."
              : "Held here for review before appearing publicly."}
          </p>
        </div>
        <form action={boundSetModeration}>
          <input
            type="hidden"
            name="allowUnmoderatedGuests"
            value={pub.allowUnmoderatedGuests ? "false" : "true"}
          />
          <button
            type="submit"
            className="themed-btn-outline rounded-lg"
            style={{ fontSize: "0.8125rem", padding: "0.4375rem 1rem" }}
          >
            {pub.allowUnmoderatedGuests ? "Require approval" : "Allow immediate posting"}
          </button>
        </form>
      </div>

      {/* ── Queue ────────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-2">
        <p className="ps-eyebrow-muted">Review queue</p>
        <span className="themed-muted" style={monoMeta}>
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-sm italic themed-muted text-center">
          The queue is empty — nothing awaits review.
        </p>
      ) : (
        <div>
          {rows.map((row) => {
            const boundModerate = moderateComment.bind(null, publisherSlug, row.subject);
            const boundDelete = deleteComment.bind(null, publisherSlug, row.subject);
            return (
              <div
                key={row.id}
                className="hover:bg-[var(--surface)] transition-colors"
                style={{ borderBottom: "1px solid var(--border)", padding: "1rem 0.5rem" }}
              >
                {/* Meta line */}
                <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
                  <span className="text-sm font-medium themed-heading">{row.authorName}</span>
                  <span className="themed-muted" style={monoMeta}>
                    {row.createdAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span
                    style={{
                      ...monoMeta,
                      fontSize: "0.5625rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      border: "1px solid var(--border)",
                      borderRadius: "9999px",
                      padding: "0.125rem 0.5rem",
                      color:
                        row.status === "spam" ? "var(--color-error)" : "var(--muted-foreground)",
                    }}
                  >
                    {row.status}
                  </span>
                  <span className="themed-muted" style={{ fontSize: "0.75rem" }}>
                    on{" "}
                    {row.subjectHref ? (
                      <Link
                        href={row.subjectHref}
                        className="themed-accent underline underline-offset-2"
                      >
                        {row.subjectTitle}
                      </Link>
                    ) : (
                      row.subjectTitle
                    )}
                  </span>
                </div>

                <p
                  className="whitespace-pre-wrap themed-foreground mt-1.5"
                  style={{ fontSize: "0.875rem", lineHeight: 1.6 }}
                >
                  {row.body}
                </p>

                {/* Actions */}
                <div className="flex items-baseline gap-4 mt-2" style={{ fontSize: "0.75rem" }}>
                  {row.status === "pending" && (
                    <>
                      <form action={boundModerate}>
                        <input type="hidden" name="commentId" value={row.id} />
                        <input type="hidden" name="status" value="approved" />
                        <button
                          type="submit"
                          className="themed-accent font-medium hover:underline underline-offset-2"
                          style={{ fontSize: "0.75rem" }}
                        >
                          Approve
                        </button>
                      </form>
                      <form action={boundModerate}>
                        <input type="hidden" name="commentId" value={row.id} />
                        <input type="hidden" name="status" value="spam" />
                        <button
                          type="submit"
                          className="themed-muted transition-colors hover:text-[var(--color-error)]"
                          style={{ fontSize: "0.75rem" }}
                        >
                          Mark as spam
                        </button>
                      </form>
                    </>
                  )}
                  {row.status === "spam" && (
                    <form action={boundModerate}>
                      <input type="hidden" name="commentId" value={row.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button
                        type="submit"
                        className="themed-accent font-medium hover:underline underline-offset-2"
                        style={{ fontSize: "0.75rem" }}
                      >
                        Not spam — approve
                      </button>
                    </form>
                  )}
                  <form action={boundDelete}>
                    <input type="hidden" name="commentId" value={row.id} />
                    <ConfirmButton
                      message="Delete this comment? This cannot be undone."
                      className="ps-quiet-action ps-quiet-action-danger"
                    >
                      Delete
                    </ConfirmButton>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
