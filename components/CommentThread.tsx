import { db } from "@/db";
import { comments, users } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import type { SessionPayload } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { GUEST_EDIT_WINDOW_MS, getGuestTokenHash } from "@/lib/comments";
import { buildTree, pruneDeleted, type TreeNode } from "@/lib/comment-tree";
import { createComment, deleteComment, editComment } from "@/app/[publisher]/comments/actions";
import type { CommentSubject } from "@/lib/validations";
import CommentForm from "./CommentForm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommentRow {
  id: number;
  parentId: number | null;
  authorName: string;
  isPending: boolean;
  canEdit: boolean;
  canDelete: boolean;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

type CommentNode = TreeNode<CommentRow>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  publisherSlug: string;
  /** Slug-based subject the server actions re-resolve and re-authorize. */
  subject: CommentSubject;
  /** Resolved DB id of the subject — articles/chapters or books. */
  subjectId: { articleId: number } | { bookId: number };
  ownerType: "user" | "org";
  ownerId: number;
  session: SessionPayload | null;
}

// ---------------------------------------------------------------------------
// Shared metadata styles (Precision Editorial mono labels)
// ---------------------------------------------------------------------------

const monoMeta = {
  fontSize: "0.6875rem",
  fontFamily: "ui-monospace, monospace",
  letterSpacing: "0.05em",
} as const;

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// CommentNode sub-component
// ---------------------------------------------------------------------------

function CommentNodeView({
  node,
  session,
  depth,
  boundCreate,
  boundDelete,
  boundEdit,
}: {
  node: CommentNode;
  session: SessionPayload | null;
  depth: number;
  boundCreate: (formData: FormData) => Promise<void>;
  boundDelete: (formData: FormData) => Promise<void>;
  boundEdit: (formData: FormData) => Promise<void>;
}) {
  const isDeleted = node.deletedAt !== null;

  return (
    <div
      className={depth > 0 ? "mt-4 pl-4 sm:pl-5" : undefined}
      style={depth > 0 ? { borderLeft: "1px solid var(--border)" } : undefined}
    >
      {isDeleted ? (
        <p className="text-sm italic themed-muted py-1">Comment removed</p>
      ) : (
        <div className="group">
          {/* Byline — name carries the weight, date recedes into mono */}
          <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
            <span className="text-sm font-medium themed-heading">{node.authorName}</span>
            <span className="themed-muted" style={monoMeta}>
              {formatDate(node.createdAt)}
              {node.updatedAt.getTime() !== node.createdAt.getTime() && (
                <span aria-label="edited"> · edited</span>
              )}
            </span>
            {node.isPending && (
              <span
                className="themed-muted"
                style={{
                  ...monoMeta,
                  fontSize: "0.5625rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  border: "1px solid var(--border)",
                  borderRadius: "9999px",
                  padding: "0.125rem 0.5rem",
                }}
              >
                awaiting moderation
              </span>
            )}
          </div>

          <p
            className="whitespace-pre-wrap themed-foreground mt-1.5"
            style={{ fontSize: "0.9375rem", lineHeight: 1.65 }}
          >
            {node.body}
          </p>

          {/* Quiet action row */}
          <div
            className="flex items-center gap-4 mt-1.5 opacity-70 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
            style={{ fontSize: "0.75rem" }}
          >
            {depth < 5 && !node.isPending && (
              <CommentForm action={boundCreate} parentId={node.id} session={session} compact />
            )}
            {node.canEdit && (
              <CommentForm
                action={boundEdit}
                commentId={node.id}
                initialBody={node.body}
                session={session}
                compact
                isEdit
              />
            )}
            {node.canDelete && (
              <form action={boundDelete}>
                <input type="hidden" name="commentId" value={node.id} />
                <button
                  type="submit"
                  className="themed-muted transition-colors hover:text-[var(--color-error)]"
                  style={{ fontSize: "0.75rem" }}
                >
                  Delete
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {node.replies.length > 0 && (
        <div>
          {node.replies.map((reply) => (
            <CommentNodeView
              key={reply.id}
              node={reply}
              session={session}
              depth={depth + 1}
              boundCreate={boundCreate}
              boundDelete={boundDelete}
              boundEdit={boundEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentThread (server component)
// ---------------------------------------------------------------------------

/**
 * Discussion thread for an article/chapter or a book. Open to guests.
 *
 * Visibility: `approved` comments are public; `pending` guest comments are
 * shown only to the guest who wrote them (cookie token match) and to
 * publisher editors; `spam` never renders here (it lives in the moderation
 * queue). Soft-deleted comments render a tombstone only while live replies
 * hang beneath them (see pruneDeleted).
 */
export default async function CommentThread({
  publisherSlug,
  subject,
  subjectId,
  ownerType,
  ownerId,
  session,
}: Props) {
  const [isEditor, guestHash] = await Promise.all([
    canEditContent(session, ownerType, ownerId),
    getGuestTokenHash({ mint: false }),
  ]);

  const subjectEq =
    "articleId" in subjectId
      ? eq(comments.articleId, subjectId.articleId)
      : eq(comments.bookId, subjectId.bookId);

  const rows = await db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      authorId: comments.authorId,
      guestName: comments.guestName,
      guestTokenHash: comments.guestTokenHash,
      status: comments.status,
      authorDisplayName: users.displayName,
      body: comments.body,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      deletedAt: comments.deletedAt,
      // DB clock, so this server component's render stays pure
      withinEditWindow: sql<boolean>`${comments.createdAt} > now() - make_interval(secs => ${GUEST_EDIT_WINDOW_MS / 1000})`,
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(and(subjectEq, ne(comments.status, "spam")))
    .orderBy(comments.createdAt);

  const visible: CommentRow[] = [];
  for (const r of rows) {
    const isOwnGuest = r.authorId === null && guestHash !== null && r.guestTokenHash === guestHash;
    if (r.status === "pending" && !isEditor && !isOwnGuest) continue;

    const isAuthor = session !== null && r.authorId === session.userId;
    const guestCanModify = isOwnGuest && r.withinEditWindow;
    visible.push({
      id: r.id,
      parentId: r.parentId,
      authorName: r.authorDisplayName ?? r.guestName ?? "Guest",
      isPending: r.status === "pending",
      canEdit: isAuthor || guestCanModify,
      canDelete: isAuthor || guestCanModify || isEditor,
      body: r.body,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
    });
  }

  const tree = pruneDeleted(buildTree(visible));

  // Bind server actions to the publisher + subject context
  const boundCreate = createComment.bind(null, publisherSlug, subject);
  const boundDelete = deleteComment.bind(null, publisherSlug, subject);
  const boundEdit = editComment.bind(null, publisherSlug, subject);

  const visibleCount = visible.filter((r) => r.deletedAt === null).length;

  return (
    <section className="mt-16">
      {/* Section rule + eyebrow header, per list-section convention */}
      <div className="flex items-baseline justify-between pb-3 border-b themed-border">
        <p className="ps-eyebrow">Discussion</p>
        <span className="themed-muted" style={monoMeta}>
          {visibleCount === 0
            ? "no comments"
            : visibleCount === 1
            ? "1 comment"
            : `${visibleCount} comments`}
        </span>
      </div>

      {/* Top-level comment form — guests welcome */}
      <div className="mt-6">
        <CommentForm action={boundCreate} session={session} />
      </div>

      {tree.length === 0 ? (
        <p className="mt-8 text-sm italic themed-muted">
          No comments yet — yours could open the discussion.
        </p>
      ) : (
        <div className="mt-10">
          {tree.map((node, i) => (
            <div
              key={node.id}
              className={i > 0 ? "mt-6 pt-6" : undefined}
              style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
            >
              <CommentNodeView
                node={node}
                session={session}
                depth={0}
                boundCreate={boundCreate}
                boundDelete={boundDelete}
                boundEdit={boundEdit}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
