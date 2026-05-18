"use client";

import { useState, useEffect, useTransition } from "react";
import { restoreRevision } from "@/app/[publisher]/articles/actions";

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function FormattedDate({ date }: { date: Date | null }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(date ? DATE_FMT.format(new Date(date)) : "Unknown date");
  }, [date]);
  return <span className="text-xs themed-muted">{label ?? ""}</span>;
}

interface Revision {
  id: number;
  editNote: string | null;
  editedAt: Date | null;
}

interface Props {
  publisherSlug: string;
  articleId: number;
  revisions: Revision[];
}

export default function RevisionHistory({ publisherSlug, articleId, revisions }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleRestore(revisionId: number) {
    if (!confirm("Restore this revision? The current content will be saved as a new revision first.")) return;
    const fd = new FormData();
    fd.append("revisionId", String(revisionId));
    fd.append("articleId", String(articleId));
    fd.append("publisherSlug", publisherSlug);
    startTransition(async () => {
      await restoreRevision(fd);
    });
  }

  if (revisions.length === 0) {
    return (
      <details className="border rounded themed-surface">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium themed-secondary select-none">
          Revision history
        </summary>
        <p className="px-4 py-3 text-sm themed-muted border-t themed-border">No revisions yet.</p>
      </details>
    );
  }

  return (
    <details className="border rounded themed-surface">
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium themed-secondary select-none">
        Revision history ({revisions.length})
      </summary>
      <div className="border-t themed-border divide-y themed-border">
        {revisions.map((rev) => (
          <div key={rev.id} className="flex items-center justify-between px-4 py-2 gap-4">
            <div className="min-w-0">
              <span className="text-sm themed-secondary truncate block">
                {rev.editNote ?? "No note"}
              </span>
              <FormattedDate date={rev.editedAt} />
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleRestore(rev.id)}
              className="text-xs themed-btn-ghost px-2 py-1 shrink-0 disabled:opacity-50"
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
