"use client";

import { useState, useTransition } from "react";
import { snapshotBook, restoreBookSnapshot } from "@/app/admin/actions";

interface Props {
  bookSlug: string;
  snapshotId?: number;
  /** When true, only render the restore button (used inside the snapshot list). */
  restoreOnly?: boolean;
}

/**
 * Client component that provides both "take snapshot" and "restore snapshot" UIs.
 * When `restoreOnly` is true, only the restore form is rendered — used within
 * the snapshot list rows.
 */
export default function SnapshotActions({ bookSlug, snapshotId, restoreOnly }: Props) {
  const [note, setNote] = useState("");
  const [restoreContent, setRestoreContent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleSnapshot() {
    startTransition(async () => {
      try {
        await snapshotBook(bookSlug, note.trim() || undefined);
        setNote("");
        setMessage("Snapshot saved.");
        setTimeout(() => setMessage(null), 3000);
      } catch (e: any) {
        setMessage(`Error: ${e.message}`);
      }
    });
  }

  function handleRestore() {
    if (!snapshotId) return;
    if (!confirm("Restore this snapshot? The current book order will be replaced.")) return;
    startTransition(async () => {
      try {
        await restoreBookSnapshot(snapshotId, restoreContent);
        setMessage("Snapshot restored.");
        setTimeout(() => setMessage(null), 3000);
      } catch (e: any) {
        setMessage(`Error: ${e.message}`);
      }
    });
  }

  if (restoreOnly) {
    return (
      <div className="flex items-center gap-3 shrink-0">
        <label className="flex items-center gap-1.5 text-xs themed-muted cursor-pointer">
          <input
            type="checkbox"
            checked={restoreContent}
            onChange={(e) => setRestoreContent(e.target.checked)}
            className="rounded"
          />
          Restore content
        </label>
        <button
          onClick={handleRestore}
          disabled={isPending}
          className="text-xs px-3 py-1.5 rounded border themed-border themed-secondary hover:themed-heading transition-colors disabled:opacity-50"
        >
          {isPending ? "Restoring..." : "Restore"}
        </button>
        {message && <span className="text-xs themed-muted">{message}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border themed-border p-5 space-y-4">
      <h2 className="text-sm font-semibold themed-heading">Take a snapshot</h2>
      <p className="text-xs themed-muted">
        Save the current book structure so you can restore it later if something goes wrong.
      </p>
      <div className="flex gap-3 flex-col sm:flex-row">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (e.g. Before major reorder)"
          className="flex-1 themed-input text-sm"
          maxLength={500}
        />
        <button
          onClick={handleSnapshot}
          disabled={isPending}
          className="themed-btn-primary text-sm whitespace-nowrap disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save snapshot"}
        </button>
      </div>
      {message && <p className="text-xs themed-muted">{message}</p>}
    </div>
  );
}
