"use client";

import { deleteArticle } from "@/app/admin/actions";

export default function DeleteButton({ id, slug, title }: { id: number; slug: string; title: string }) {
  return (
    <form action={deleteArticle}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        onClick={(e) => {
          if (!confirm(`Delete "${title}"? This cannot be undone.`)) {
            e.preventDefault();
          }
        }}
        className="px-4 py-2 text-sm rounded border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
      >
        Delete article
      </button>
    </form>
  );
}
