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
    <main className="w-full max-w-4xl mx-auto px-5 py-10 sm:py-14">
      <div className="mb-10">
        <p className="ps-eyebrow mb-1.5">@{publisherSlug}</p>
        <h1
          className="ps-display themed-heading"
          style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}
        >
          Comment moderation
        </h1>
        <p className="text-sm themed-muted mt-2">
          {pendingCount === 0
            ? "No comments waiting for review."
            : `${pendingCount} comment${pendingCount === 1 ? "" : "s"} waiting for review.`}
        </p>
      </div>

      {/* Guest moderation policy toggle */}
      <form action={boundSetModeration} className="mb-10 flex items-center gap-3">
        <input
          type="hidden"
          name="allowUnmoderatedGuests"
          value={pub.allowUnmoderatedGuests ? "false" : "true"}
        />
        <span className="text-sm">
          Guest comments currently{" "}
          <strong>
            {pub.allowUnmoderatedGuests ? "post immediately" : "require approval"}
          </strong>
          .
        </span>
        <button
          type="submit"
          className="px-3 py-1.5 text-sm font-medium rounded border themed-border hover:themed-link transition-colors"
        >
          {pub.allowUnmoderatedGuests ? "Require approval" : "Allow immediate posting"}
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm themed-muted">The queue is empty. 🎉</p>
      ) : (
        <div className="space-y-1 divide-y themed-border">
          {rows.map((row) => {
            const boundModerate = moderateComment.bind(null, publisherSlug, row.subject);
            const boundDelete = deleteComment.bind(null, publisherSlug, row.subject);
            return (
              <div key={row.id} className="py-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-medium themed-heading">{row.authorName}</span>
                  <span className="text-xs themed-muted">
                    {row.createdAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded border themed-border themed-muted">
                    {row.status}
                  </span>
                  <span className="text-xs themed-muted">
                    on{" "}
                    {row.subjectHref ? (
                      <Link
                        href={row.subjectHref}
                        className="themed-link underline underline-offset-2"
                      >
                        {row.subjectTitle}
                      </Link>
                    ) : (
                      row.subjectTitle
                    )}
                  </span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap mb-2">{row.body}</p>
                <div className="flex gap-3">
                  {row.status === "pending" && (
                    <>
                      <form action={boundModerate}>
                        <input type="hidden" name="commentId" value={row.id} />
                        <input type="hidden" name="status" value="approved" />
                        <button
                          type="submit"
                          className="text-xs font-medium themed-link hover:underline"
                        >
                          Approve
                        </button>
                      </form>
                      <form action={boundModerate}>
                        <input type="hidden" name="commentId" value={row.id} />
                        <input type="hidden" name="status" value="spam" />
                        <button
                          type="submit"
                          className="text-xs themed-muted hover:text-red-500 transition-colors"
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
                        className="text-xs font-medium themed-link hover:underline"
                      >
                        Not spam — approve
                      </button>
                    </form>
                  )}
                  <form action={boundDelete}>
                    <input type="hidden" name="commentId" value={row.id} />
                    <button
                      type="submit"
                      className="text-xs themed-muted hover:text-red-500 transition-colors"
                    >
                      Delete
                    </button>
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
