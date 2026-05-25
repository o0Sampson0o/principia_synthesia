"use client";

import { deleteArticle } from "@/app/[publisher]/articles/actions";

export default function DeleteArticleButton({
  publisherSlug,
  articleId,
  articleSlug,
}: {
  publisherSlug: string;
  articleId: number;
  articleSlug: string;
}) {
  async function handleDelete() {
    if (!confirm("Delete this article permanently? This cannot be undone.")) return;
    const fd = new FormData();
    fd.append("id", String(articleId));
    fd.append("slug", articleSlug);
    await deleteArticle(publisherSlug, fd);
  }

  return (
    <button type="button" onClick={handleDelete} className="themed-btn-danger text-sm">
      Delete article
    </button>
  );
}
