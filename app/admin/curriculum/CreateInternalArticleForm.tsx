"use client";

import { useState, useRef } from "react";
import { createInternalArticle } from "@/app/admin/actions";

interface Props {
  bookSlug: string;
  bookTitle: string;
  nextPosition: number;
}

export default function CreateInternalArticleForm({ bookSlug, bookTitle, nextPosition }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const t = e.target.value;
    setTitle(t);
    setSlug(t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mt-2"
      >
        + New internal article
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={createInternalArticle}
      className="mt-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 space-y-2"
    >
      <input type="hidden" name="bookSlug" value={bookSlug} />
      <input type="hidden" name="bookTitle" value={bookTitle} />
      <input type="hidden" name="position" value={nextPosition} />

      <div className="grid grid-cols-2 gap-2">
        <input
          name="title"
          value={title}
          onChange={handleTitleChange}
          placeholder="Title"
          required
          className="border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-zinc-900 w-full"
        />
        <input
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug"
          required
          className="border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-zinc-900 w-full font-mono"
        />
      </div>
      <input
        name="partTitle"
        placeholder="Part title (optional)"
        className="border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5 text-sm bg-white dark:bg-zinc-900 w-full"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="px-3 py-1.5 text-xs rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setTitle(""); setSlug(""); }}
          className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
