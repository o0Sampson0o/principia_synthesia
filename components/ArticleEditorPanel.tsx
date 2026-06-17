"use client";

import { useRef, useCallback, useEffect } from "react";
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
}: {
  publisherSlug: string;
  /** Stable per-article key for the localStorage draft (e.g. `slug:article-12`). */
  draftKey: string;
  initial?: string;
  initialMetadata: ArticleMetadata;
}) {
  const editorRef = useRef<ContentEditorRef>(null);
  const frontmatterRef = useRef<FrontmatterPanelRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const { schedule, clear, restorable, dismissRestorable, lastSavedAt } =
    useDraftAutosave({ storageKey: draftKey, getSnapshot });

  // Autosave on form-field edits (title/slug/summary/editNote) and drop the
  // draft once the form is submitted — by then the server has the content.
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

  // Only prompt to recover when the draft actually diverges from what the
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

  const handleSaveAsDraft = useCallback(() => {
    // setStatus rewrites the editor content (and the hidden #content-field)
    // synchronously, so the form submits with `status: draft`.
    frontmatterRef.current?.setStatus("draft");
    getForm()?.requestSubmit();
  }, [getForm]);

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
            {lastSavedAt && (
              <span className="text-xs themed-muted">
                Saved {new Date(lastSavedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveAsDraft}
              className="themed-btn-ghost text-xs px-2 py-1"
            >
              Save as draft
            </button>
            <InsertImageButton publisherSlug={publisherSlug} editorRef={editorRef} />
          </>
        }
      />
    </div>
  );
}
