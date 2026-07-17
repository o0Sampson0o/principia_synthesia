import { describe, it, expect } from "vitest";
import { buildTree, pruneDeleted, type TreeComment } from "@/lib/comment-tree";

function c(id: number, parentId: number | null, deleted = false): TreeComment {
  return { id, parentId, deletedAt: deleted ? new Date() : null };
}

describe("buildTree", () => {
  it("nests replies under their parents and orphans under root", () => {
    const tree = buildTree([c(1, null), c(2, 1), c(3, 2), c(4, 999)]);
    expect(tree.map((n) => n.id)).toEqual([1, 4]);
    expect(tree[0].replies[0].id).toBe(2);
    expect(tree[0].replies[0].replies[0].id).toBe(3);
  });
});

describe("pruneDeleted", () => {
  it("drops a deleted leaf entirely", () => {
    const tree = pruneDeleted(buildTree([c(1, null), c(2, 1, true)]));
    expect(tree).toHaveLength(1);
    expect(tree[0].replies).toHaveLength(0);
  });

  it("drops chains of deleted comments with no visible descendant", () => {
    const tree = pruneDeleted(buildTree([c(1, null, true), c(2, 1, true), c(3, 2, true)]));
    expect(tree).toHaveLength(0);
  });

  it("keeps a deleted comment as tombstone when a visible reply hangs below", () => {
    const tree = pruneDeleted(buildTree([c(1, null, true), c(2, 1), c(3, null, true)]));
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(1);
    expect(tree[0].deletedAt).not.toBeNull();
    expect(tree[0].replies.map((n) => n.id)).toEqual([2]);
  });

  it("keeps deleted intermediates when the visible comment is deeper down", () => {
    const tree = pruneDeleted(buildTree([c(1, null, true), c(2, 1, true), c(3, 2)]));
    expect(tree).toHaveLength(1);
    expect(tree[0].replies[0].id).toBe(2);
    expect(tree[0].replies[0].replies[0].id).toBe(3);
  });

  it("leaves fully visible threads untouched", () => {
    const tree = pruneDeleted(buildTree([c(1, null), c(2, 1), c(3, null)]));
    expect(tree.map((n) => n.id)).toEqual([1, 3]);
    expect(tree[0].replies.map((n) => n.id)).toEqual([2]);
  });
});
