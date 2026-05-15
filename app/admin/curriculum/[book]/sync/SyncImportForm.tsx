"use client";

import { useActionState } from "react";
import { importSyncBundle, type SyncImportResult } from "./actions";

export default function SyncImportForm({ bookSlug }: { bookSlug: string }) {
  const action = importSyncBundle.bind(null, bookSlug);
  const [state, formAction, pending] = useActionState<SyncImportResult | null, FormData>(
    action,
    null
  );

  return (
    <div className="rounded-lg border themed-border p-4">
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="bundle" className="block text-xs font-medium themed-muted mb-2">
            Upload sync bundle (.zip)
          </label>
          <input
            id="bundle"
            name="bundle"
            type="file"
            accept=".zip,application/zip"
            required
            className="block w-full text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="themed-btn-primary px-4 py-2 rounded text-sm disabled:opacity-50"
        >
          {pending ? "Importing..." : "Import"}
        </button>
      </form>

      {state && !state.ok && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      {state && state.ok && (
        <div className="mt-6 space-y-4 text-sm">
          <div>
            <p className="font-medium themed-heading">
              Updated ({state.updated.length})
            </p>
            {state.updated.length === 0 ? (
              <p className="themed-muted">None.</p>
            ) : (
              <ul className="list-disc list-inside themed-muted">
                {state.updated.map((slug) => (
                  <li key={slug}>{slug}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="font-medium themed-heading">
              Skipped ({state.skipped.length})
            </p>
            {state.skipped.length === 0 ? (
              <p className="themed-muted">None.</p>
            ) : (
              <ul className="list-disc list-inside themed-muted">
                {state.skipped.map((s) => (
                  <li key={s.slug}>
                    <span className="font-mono">{s.slug}</span> — {labelFor(s.reason)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function labelFor(reason: "unknown-slug" | "missing-mdx-file" | "db-newer"): string {
  switch (reason) {
    case "unknown-slug":
      return "no article with this slug exists (import does not create new articles)";
    case "missing-mdx-file":
      return "chapters/<slug>.mdx not found in the zip";
    case "db-newer":
      return "the DB version is newer than the zip";
  }
}
