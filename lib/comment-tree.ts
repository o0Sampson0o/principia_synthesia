/**
 * Pure tree helpers for comment threads (extracted from CommentThread so they
 * can be unit-tested without the server-component dependency graph).
 */

export interface TreeComment {
  id: number;
  parentId: number | null;
  deletedAt: Date | null;
}

export type TreeNode<T extends TreeComment> = T & { replies: TreeNode<T>[] };

export function buildTree<T extends TreeComment>(rows: T[]): TreeNode<T>[] {
  const nodeMap = new Map<number, TreeNode<T>>();
  for (const row of rows) {
    nodeMap.set(row.id, { ...row, replies: [] });
  }

  const roots: TreeNode<T>[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        parent.replies.push(node);
      } else {
        // Orphaned reply (parent hidden or hard-deleted) — attach to root
        roots.push(node);
      }
    }
  }

  return roots;
}

/**
 * Drops deleted comments that no longer serve a purpose. A deleted comment
 * renders as a "Comment removed" tombstone only to hold the slot for visible
 * replies beneath it — so any deleted node whose subtree contains no visible
 * comment is pruned entirely.
 */
export function pruneDeleted<T extends TreeComment>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  const kept: TreeNode<T>[] = [];
  for (const node of nodes) {
    node.replies = pruneDeleted(node.replies);
    if (node.deletedAt === null || node.replies.length > 0) kept.push(node);
  }
  return kept;
}
