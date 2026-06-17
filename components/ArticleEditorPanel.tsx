"use client";

import { useRef, useCallback, useEffect, useState, useTransition } from "react";
import ContentEditor, { type ContentEditorRef } from "./ContentEditor";
import InsertImageButton from "./InsertImageButton";
import FrontmatterPanel, { type FrontmatterPanelRef } from "./FrontmatterPanel";
import { useDraftAutosave, type DraftData } from "@/lib/useDraftAutosave";
import type { ArticleMetadata } from "@/lib/validations";

// Sibling form fields (outside this panel) that are worth recovering alongside
// the MDX content. Missing fields (e.g. `editNote` on the new-article form) are
// simply skipped.
const SNAPSHOT_FIELDS = ["title", "slug", "summary", "editNote"] as const;

export default function ArticleEditorPanel({
  publisherSlug,
  draftKey,
  initial = "",
  initialMetadata,
  saveDraftAction,
  initialDraftSavedAt = null,
}: {
  publisherSlug: string;
  /** Stable per-article key for the localStorage draft (e.g. `slug:article-12`). */
  draftKey: string;
  initial?: string;
  initialMetadata: ArticleMetadata;
  /**
   * Persists the current content as a server-side draft and returns when it was
   * saved. Omitted on the new-article page (no record exists yet), which hides
   * the button and relies on the localStorage autosave instead.
   */
  saveDraftAction?: (content: string) => Promise<{ ok: true; savedAt: string }>;
  /** ISO timestamp of the existing server draft, if any. */
  initialDraftSavedAt?: string | null;
}) {
  const editorRef = useRef<ContentEditorRef>(null);
  const frontmatterRef = useRef<FrontmatterPanelRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(initialDraftSavedAt);
  const [isSaving, startSaving] = useTransition();

  const getForm = useCallback(
    () => rootRef.current?.closest("form") ?? null,
    []
  );

  const getSnapshot = useCallback((): DraftData => {
    const data: DraftData = { content: editorRef.current?.getValue() ?? initial };
    const form = getForm();
    if (form) {
      for (const name of SNAPSHOT_FIELDS) {
        const el = form.elements.namedItem(name) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (el) data[name] = el.value;
      }
    }
    return data;
  }, [getForm, initial]);

  const { schedule, clear, restorable, dismissRestorable } =
    useDraftAutosave({ storageKey: draftKey, getSnapshot });

  // Autosave on form-field edits (title/slug/summary/editNote) and drop the
  // local draft once the form is submitted — by then the server has the content.
  useEffect(() => {
    const form = getForm();
    if (!form) return;
    const onInput = () => schedule();
    const onSubmit = () => clear();
    form.addEventListener("input", onInput);
    form.addEventListener("submit", onSubmit);
    return () => {
      form.removeEventListener("input", onInput);
      form.removeEventListener("submit", onSubmit);
    };
  }, [getForm, schedule, clear]);

  // Only prompt to recover when the local draft actually diverges from what the
  // server loaded (a draft equal to `initial` was already saved).
  const showRestore =
    restorable !== null && restorable.data.content.trim() !== initial.trim();

  const handleRestore = useCallback(() => {
    if (!restorable) return;
    editorRef.current?.setValue(restorable.data.content);
    frontmatterRef.current?.syncFromMdx(restorable.data.content);
    const form = getForm();
    if (form) {
      for (const name of SNAPSHOT_FIELDS) {
        const value = restorable.data[name];
        if (typeof value !== "string") continue;
        const el = form.elements.namedItem(name) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (el) el.value = value;
      }
    }
    dismissRestorable();
  }, [restorable, getForm, dismissRestorable]);

  // Save the current content as a server-side draft, staying in the editor.
  // The published article is untouched until a real save.
  const handleSaveDraft = useCallback(() => {
    if (!saveDraftAction) return;
    const content = editorRef.current?.getValue() ?? initial;
    startSaving(async () => {
      const res = await saveDraftAction(content);
      setDraftSavedAt(res.savedAt);
      clear(); // server now holds the draft — drop the local copy
    });
  }, [saveDraftAction, initial, clear]);

  return (
    <div ref={rootRef} className="space-y-3">
      {showRestore && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 px-4 py-2 text-sm">
          <span className="themed-secondary">
            Recovered unsaved changes from{" "}
            {new Date(restorable!.savedAt).toLocaleString()}.
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={handleRestore}
              className="themed-btn-primary text-xs px-2 py-1"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={clear}
              className="themed-btn-ghost text-xs px-2 py-1"
            >
              Discard
            </button>
          </span>
        </div>
      )}
      <FrontmatterPanel
        ref={frontmatterRef}
        editorRef={editorRef}
        initialMetadata={initialMetadata}
      />
      <ContentEditor
        ref={editorRef}
        initial={initial}
        onChange={(val) => {
          frontmatterRef.current?.syncFromMdx(val);
          schedule();
        }}
        toolbar={
          <>
            {saveDraftAction && (
              <>
                {draftSavedAt && !isSaving && (
                  <span className="text-xs themed-muted">
                    Draft saved {new Date(draftSavedAt).toLocaleTimeString()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="themed-btn-ghost text-xs px-2 py-1 disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Save as draft"}
                </button>
              </>
            )}
            <InsertImageButton publisherSlug={publisherSlug} editorRef={editorRef} />
          </>
        }
      />
    </div>
  );
}
