"use client";
import { useOptimistic, useTransition } from "react";
import { removeCurriculumEntry } from "@/app/admin/actions";
import Link from "next/link";

type Entry = {
  id: number; bookSlug: string; position: number; partTitle: string | null;
  articleSlug: string; articleTitle: string;
};

export function EntriesList({ entries }: { entries: Entry[] }) {
  const [optimistic, setOptimistic] = useOptimistic(
    entries,
    (state, removedId: number) => state.filter((e) => e.id !== removedId)
  );
  const [, startTransition] = useTransition();

  function handleRemove(id: number, bookSlug: string) {
    startTransition(async () => {
      setOptimistic(id);
      const fd = new FormData();
      fd.set("id", String(id));
      fd.set("bookSlug", bookSlug);
      await removeCurriculumEntry(fd);
    });
  }

  return (
    <ol className="space-y-1">
      {optimistic.map((e) => (
        <li key={e.id} className="flex sm:flex-row flex-col sm:items-center sm:justify-between py-1 group gap-1 sm:gap-0">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="text-xs text-zinc-300 dark:text-zinc-600 w-5 text-right shrink-0 tabular-nums">
              {e.position}
            </span>
            <Link href={`/${e.articleSlug}`} className="text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors truncate">
              {e.articleTitle}
            </Link>
            {e.partTitle && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">— {e.partTitle}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleRemove(e.id, e.bookSlug)}
            className="text-xs text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors sm:opacity-0 sm:group-hover:opacity-100 self-start sm:self-auto ml-8 sm:ml-2 shrink-0"
          >
            Remove
          </button>
        </li>
      ))}
    </ol>
  );
}
