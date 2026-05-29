import { db } from "@/db";
import { articleComments, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { SessionPayload } from "@/lib/auth";
import { createComment, deleteComment, editComment } from "@/app/[publisher]/articles/[slug]/comments/actions";
import CommentForm from "./CommentForm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawComment {
  id: number;
  parentId: number | null;
  authorId: number;
  authorName: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface CommentNode extends RawComment {
  replies: CommentNode[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  articleId: number;
  publisherSlug: string;
  articleSlug: string;
  session: SessionPayload | null;
}

// ---------------------------------------------------------------------------
// Tree builder
// ---------------------------------------------------------------------------

function buildTree(rows: RawComment[]): CommentNode[] {
  const nodeMap = new Map<number, CommentNode>();
  for (const row of rows) {
    nodeMap.set(row.id, { ...row, replies: [] });
  }

  const roots: CommentNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        parent.replies.push(node);
      } else {
        // Orphaned reply (parent was hard-deleted) — attach to root
        roots.push(node);
      }
    }
  }

  return roots;
}

// ---------------------------------------------------------------------------
// CommentNode sub-component
// ---------------------------------------------------------------------------

function CommentNodeView({
  node,
  articleId,
  publisherSlug,
  articleSlug,
  session,
  depth,
  boundCreate,
  boundDelete,
  boundEdit,
}: {
  node: CommentNode;
  articleId: number;
  publisherSlug: string;
  articleSlug: string;
  session: SessionPayload | null;
  depth: number;
  boundCreate: (formData: FormData) => Promise<void>;
  boundDelete: (formData: FormData) => Promise<void>;
  boundEdit: (formData: FormData) => Promise<void>;
}) {
  const isDeleted = node.deletedAt !== null;
  const isAuthor = session && session.userId === node.authorId;

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
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{node.body}</p>

            {session && (
              <div className="flex gap-3 mt-1">
                {/* Reply form — shallow nesting only one level deeper */}
                {depth < 5 && (
                  <CommentForm
                    action={boundCreate}
                    articleId={articleId}
                    parentId={node.id}
                    session={session}
                    compact
                  />
                )}
                {isAuthor && (
                  <>
                    <CommentForm
                      action={boundEdit}
                      articleId={articleId}
                      commentId={node.id}
                      initialBody={node.body}
                      session={session}
                      compact
                      isEdit
                    />
                    <form action={boundDelete}>
                      <input type="hidden" name="commentId" value={node.id} />
                      <input type="hidden" name="articleId" value={articleId} />
                      <button
                        type="submit"
                        className="text-xs themed-muted hover:text-red-500 transition-colors"
                      >
                        Delete
                      </button>
                    </form>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {node.replies.length > 0 && (
        <div>
          {node.replies.map((reply) => (
            <CommentNodeView
              key={reply.id}
              node={reply}
              articleId={articleId}
              publisherSlug={publisherSlug}
              articleSlug={articleSlug}
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

export default async function CommentThread({
  articleId,
  publisherSlug,
  articleSlug,
  session,
}: Props) {
  // Fetch all comments for this article, including soft-deleted ones (so
  // thread structure is preserved), joined with author display name.
  const rows = await db
    .select({
      id: articleComments.id,
      parentId: articleComments.parentId,
      authorId: articleComments.authorId,
      authorName: users.displayName,
      body: articleComments.body,
      createdAt: articleComments.createdAt,
      updatedAt: articleComments.updatedAt,
      deletedAt: articleComments.deletedAt,
    })
    .from(articleComments)
    .innerJoin(users, eq(articleComments.authorId, users.id))
    .where(eq(articleComments.articleId, articleId))
    .orderBy(articleComments.createdAt);

  const tree = buildTree(rows);

  // Bind server actions to the publisher + slug context
  const boundCreate = createComment.bind(null, publisherSlug, articleSlug);
  const boundDelete = deleteComment.bind(null, publisherSlug, articleSlug);
  const boundEdit = editComment.bind(null, publisherSlug, articleSlug);

  const visibleCount = rows.filter((r) => r.deletedAt === null).length;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold mb-4 themed-heading">
        {visibleCount === 0
          ? "No comments yet"
          : visibleCount === 1
          ? "1 comment"
          : `${visibleCount} comments`}
      </h2>

      {/* Top-level comment form */}
      <CommentForm
        action={boundCreate}
        articleId={articleId}
        session={session}
      />

      {tree.length > 0 && (
        <div className="mt-6 space-y-1 divide-y themed-border">
          {tree.map((node) => (
            <CommentNodeView
              key={node.id}
              node={node}
              articleId={articleId}
              publisherSlug={publisherSlug}
              articleSlug={articleSlug}
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
