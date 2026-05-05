"use client";

import { useActionState, useState } from "react";
import { updateArticle } from "@/app/admin/actions";
import ContentEditor from "@/components/ContentEditor";
import CategoryInput from "@/components/CategoryInput";

const initialState: { error?: Record<string, string> } = {};

export default function EditForm({
  article,
  existingCats,
}: {
  article: { id: number; title: string; slug: string; summary: string | null; content: string | null };
  existingCats: { slug: string }[];
}) {
  const [state, formAction] = useActionState(updateArticle, initialState);
  const [mdxError, setMdxError] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={article.id} />
      {state?.error?.id && (
        <p className="text-sm text-red-500">{state.error.id}</p>
      )}

      <div>
        <input
          name="title"
          defaultValue={article.title}
          placeholder="Title"
          required
          className="w-full border border-zinc-200 dark:border-zinc-800 rounded px-4 py-2 bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
        />
        {state?.error?.title && (
          <p className="text-sm text-red-500 mt-1">{state.error.title}</p>
        )}
      </div>

      <div>
        <input
          name="slug"
          defaultValue={article.slug}
          placeholder="slug-like-this"
          required
          className="w-full border border-zinc-200 dark:border-zinc-800 rounded px-4 py-2 bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
        />
        {state?.error?.slug && (
          <p className="text-sm text-red-500 mt-1">{state.error.slug}</p>
        )}
      </div>

      <div>
        <input
          name="summary"
          defaultValue={article.summary || ""}
          placeholder="Short summary"
          className="w-full border border-zinc-200 dark:border-zinc-800 rounded px-4 py-2 bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
        />
        {state?.error?.summary && (
          <p className="text-sm text-red-500 mt-1">{state.error.summary}</p>
        )}
      </div>

      <CategoryInput initial={existingCats.map((c) => c.slug)} />
      {state?.error?.categories && (
        <p className="text-sm text-red-500">{state.error.categories}</p>
      )}

      <ContentEditor initial={article.content || ""} onError={setMdxError} />
      {state?.error?.content && (
        <p className="text-sm text-red-500">{state.error.content}</p>
      )}

      <div>
        <input
          name="editNote"
          placeholder="Edit note (optional)"
          defaultValue="Updated"
          className="w-full border border-zinc-200 dark:border-zinc-800 rounded px-4 py-2 bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors text-sm"
        />
      </div>

      {mdxError && (
        <p className="text-sm text-red-500">
          Fix content errors before saving.
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={mdxError}
          className="px-4 py-2 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save changes
        </button>
      </div>

      {state?.error?.form && (
        <p className="text-sm text-red-500">{state.error.form}</p>
      )}
    </form>
  );
}
