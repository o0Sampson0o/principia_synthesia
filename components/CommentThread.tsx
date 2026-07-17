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
    <div className={depth > 0 ? "pl-4 border-l themed-border" : ""}>
      <div className="py-3">
        {isDeleted ? (
          <p className="text-sm italic themed-muted">Comment removed</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium themed-heading">{node.authorName}</span>
              <span className="text-xs themed-muted">
                {node.createdAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {node.updatedAt.getTime() !== node.createdAt.getTime() && " (edited)"}
              </span>
              {node.isPending && (
                <span className="text-xs px-1.5 py-0.5 rounded border themed-border themed-muted">
                  awaiting moderation
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{node.body}</p>

            <div className="flex gap-3 mt-1">
              {/* Reply form — pending comments can't collect replies */}
              {depth < 5 && !node.isPending && (
                <CommentForm
                  action={boundCreate}
                  parentId={node.id}
                  session={session}
                  compact
                />
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
                    className="text-xs themed-muted hover:text-red-500 transition-colors"
                  >
                    Delete
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>

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
 * queue). Soft-deleted comments keep their slot as "Comment removed".
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
    <section className="mt-10">
      <h2 className="text-lg font-semibold mb-4 themed-heading">
        {visibleCount === 0
          ? "No comments yet"
          : visibleCount === 1
          ? "1 comment"
          : `${visibleCount} comments`}
      </h2>

      {/* Top-level comment form — guests welcome */}
      <CommentForm action={boundCreate} session={session} />

      {tree.length > 0 && (
        <div className="mt-6 space-y-1 divide-y themed-border">
          {tree.map((node) => (
            <CommentNodeView
              key={node.id}
              node={node}
              session={session}
              depth={0}
              boundCreate={boundCreate}
              boundDelete={boundDelete}
              boundEdit={boundEdit}
            />
          ))}
        </div>
      )}
    </section>
  );
}
