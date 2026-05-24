"use client";

import { useState, useActionState } from "react";
import type { ImportPreview, ImportConfirm } from "@/app/[publisher]/events/import/actions";

type PreviewState = ImportPreview | { error: string } | null;
type ConfirmState = ImportConfirm | { error: string } | null;

interface Props {
  previewAction: (state: unknown, formData: FormData) => Promise<ImportPreview | { error: string }>;
  confirmAction: (state: unknown, formData: FormData) => Promise<ImportConfirm | { error: string }>;
}

function isError(state: PreviewState | ConfirmState): state is { error: string } {
  return state !== null && "error" in state;
}

function isPreview(state: PreviewState): state is ImportPreview {
  return state !== null && "toInsert" in state;
}

function isConfirmed(state: ConfirmState): state is ImportConfirm {
  return state !== null && "inserted" in state;
}

export default function ImportEventsForm({ previewAction, confirmAction }: Props) {
  const [format, setFormat] = useState<"csv" | "json" | "wikidata">("csv");
  const [previewState, previewDispatch, previewPending] = useActionState(previewAction, null);
  const [confirmState, confirmDispatch, confirmPending] = useActionState(confirmAction, null);
  const [lastFormData, setLastFormData] = useState<FormData | null>(null);

  const hasPreview = isPreview(previewState);

  function handlePreviewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLastFormData(fd);
    previewDispatch(fd);
  }

  function handleConfirm() {
    if (!lastFormData) return;
    confirmDispatch(lastFormData);
  }

  if (isConfirmed(confirmState)) {
    return (
      <div className="rounded border themed-border themed-surface p-6 text-center space-y-2">
        <p className="text-lg font-semibold themed-heading">Import complete</p>
        <p className="themed-secondary">
          {confirmState.inserted} event(s) inserted, {confirmState.updated} updated.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handlePreviewSubmit} className="space-y-4">
        <div>
          <label htmlFor="format" className="block text-sm font-medium themed-secondary mb-1">
            Format
          </label>
          <select
            id="format"
            name="format"
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
            className="themed-input"
            required
          >
            <option value="csv">CSV file</option>
            <option value="json">JSON file</option>
            <option value="wikidata">Wikidata SPARQL</option>
          </select>
        </div>

        {format !== "wikidata" ? (
          <div>
            <label htmlFor="file" className="block text-sm font-medium themed-secondary mb-1">
              File (max 5 MB)
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept={format === "csv" ? ".csv,text/csv" : ".json,application/json"}
              required
              className="themed-input"
            />
          </div>
        ) : (
          <div>
            <label htmlFor="sparqlQuery" className="block text-sm font-medium themed-secondary mb-1">
              SPARQL query
            </label>
            <textarea
              id="sparqlQuery"
              name="sparqlQuery"
              rows={6}
              required
              placeholder={`SELECT ?item ?itemLabel ?date ?description WHERE {\n  # Add your Wikidata query here\n  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }\n}`}
              className="themed-input w-full font-mono text-sm resize-y"
            />
          </div>
        )}

        <button type="submit" disabled={previewPending} className="themed-btn-primary">
          {previewPending ? "Analysing…" : "Preview import"}
        </button>
      </form>

      {isError(previewState) && (
        <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          {previewState.error}
        </div>
      )}

      {hasPreview && (
        <div className="space-y-4">
          <div className="rounded border themed-border themed-surface p-4 text-sm space-y-1">
            <p>
              <span className="font-medium">Will insert:</span>{" "}
              <span className="themed-heading">{previewState.toInsert}</span> event(s)
            </p>
            <p>
              <span className="font-medium">Will update:</span>{" "}
              <span className="themed-heading">{previewState.toUpdate}</span> event(s)
            </p>
            {previewState.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer themed-muted">
                  {previewState.errors.length} row(s) with errors (will be skipped)
                </summary>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  {previewState.errors.map((err) => (
                    <li key={err.row} className="text-red-600 dark:text-red-400">
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {(previewState.toInsert > 0 || previewState.toUpdate > 0) && (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirmPending}
                className="themed-btn-primary"
              >
                {confirmPending ? "Importing…" : "Confirm import"}
              </button>
              <p className="text-xs themed-muted">This action cannot be undone.</p>
            </div>
          )}

          {isError(confirmState) && (
            <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
              {confirmState.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
