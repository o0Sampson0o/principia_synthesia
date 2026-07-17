import { db } from "@/db";
import { comments, users } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import type { SessionPayload } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { GUEST_EDIT_WINDOW_MS, getGuestTokenHash } from "@/lib/comments";
import { buildTree, pruneDeleted, type TreeNode } from "@/lib/comment-tree";
import { createComment, deleteComment, editComment } from "@/app/[publisher]/comments/actions";
import type { CommentSubject } from "@/lib/validations";
import Link from "next/link";
import { formatDate } from "@/lib/format-date";
import CommentForm from "./CommentForm";
import ConfirmButton from "./ConfirmButton";
import SectionHeader from "./SectionHeader";

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
  /**
   * Archived-snapshot mode: the thread stays visible (it belongs to the
   * article, not the version) but composing, replying, editing, and
   * deleting are disabled; a note points to the live version instead.
   */
  readOnly?: boolean;
  /** Where the live discussion happens; shown in the read-only note. */
  liveHref?: string;
}


// ---------------------------------------------------------------------------
// CommentNode sub-component
// ---------------------------------------------------------------------------

function CommentNodeView({
  node,
  session,
  depth,
  readOnly,
  boundCreate,
  boundDelete,
  boundEdit,
}: {
  node: CommentNode;
  session: SessionPayload | null;
  depth: number;
  readOnly: boolean;
  boundCreate: (formData: FormData) => Promise<void | { error: string }>;
  boundDelete: (formData: FormData) => Promise<void>;
  boundEdit: (formData: FormData) => Promise<void | { error: string }>;
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
            <span className="themed-muted ps-mono-meta">
              {formatDate(node.createdAt)}
              {node.updatedAt.getTime() !== node.createdAt.getTime() && <span> · edited</span>}
            </span>
            {node.isPending && (
              <span className="themed-muted ps-mono-micro ps-status-pill">
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

          {/* Quiet action row — always visible (touch devices have no hover) */}
          {!readOnly && (
          <div className="flex items-center gap-2 mt-1" style={{ fontSize: "0.75rem" }}>
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
                <ConfirmButton
                  message="Delete this comment? This cannot be undone."
                  className="ps-quiet-action ps-quiet-action-danger"
                >
                  Delete
                </ConfirmButton>
              </form>
            )}
          </div>
          )}
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
              readOnly={readOnly}
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
  readOnly = false,
  liveHref,
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
      <SectionHeader
        title="Discussion"
        count={
          visibleCount === 0
            ? "no comments"
            : visibleCount === 1
            ? "1 comment"
            : `${visibleCount} comments`
        }
      />

      {readOnly ? (
        <p className="mt-6 text-sm themed-muted">
          You are reading an archived version — the discussion continues on the{" "}
          <Link href={liveHref ?? "#"} className="themed-link">
            current version
          </Link>
          .
        </p>
      ) : (
        /* Top-level comment form — guests welcome */
        <div className="mt-6">
          <CommentForm action={boundCreate} session={session} />
        </div>
      )}

      {tree.length === 0 ? (
        !readOnly && (
          <p className="mt-8 text-sm italic themed-muted">
            No comments yet — yours could open the discussion.
          </p>
        )
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
                readOnly={readOnly}
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
