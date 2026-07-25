"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { javascript } from "@codemirror/lang-javascript";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { useAnimationSrc } from "@/lib/useAnimationSrc";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

type UpdateResult = { ok: true; slug: string } | { errors: Partial<Record<string, string[]>> };

interface Props {
  publisherSlug: string;
  /** Current slug in the URL (before any rename). */
  objSlug: string;
  id: number;
  slug: string;
  name: string;
  description: string;
  initialCode: string;
  updateAction: (prevState: UpdateResult | null, formData: FormData) => Promise<UpdateResult>;
  deleteAction: (formData: FormData) => Promise<void>;
}

export default function AnimationEditor({
  publisherSlug,
  objSlug,
  id,
  slug: initialSlug,
  name,
  description,
  initialCode,
  updateAction,
  deleteAction,
}: Props) {
  const [code, setCode] = useState(initialCode);
  const [slug, setSlug] = useState(initialSlug);
  const [savedSlug, setSavedSlug] = useState(objSlug);
  const [previewVersion, setPreviewVersion] = useState(1); // show the saved animation on load
  const [isDark, setIsDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const contentRef = useRef<HTMLInputElement>(null);
  const wasPending = useRef(false);

  // Editor theme follows the OS/browser preference (updates on change).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Keep the hidden `content` field in sync as { code } — the DB shape is unchanged.
  useEffect(() => {
    if (contentRef.current) contentRef.current.value = JSON.stringify({ code });
  }, [code]);

  // After a successful save: refresh the preview and, on rename, update the URL.
  useEffect(() => {
    if (wasPending.current && !isPending && state && "ok" in state) {
      setSavedSlug(state.slug);
      setPreviewVersion((v) => v + 1);
      if (state.slug !== objSlug) {
        window.history.replaceState(null, "", `/${publisherSlug}/objects/${state.slug}/edit`);
      }
    }
    wasPending.current = isPending;
  }, [isPending, state, objSlug, publisherSlug]);

  const errors = state && "errors" in state ? state.errors : undefined;
  // SSR-safe: null until mounted (the hook reads getComputedStyle for theme tokens).
  const previewSrc = useAnimationSrc(publisherSlug, savedSlug, previewVersion);

  return (
    <div className="space-y-6">
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="type" value="animation" />
        <input ref={contentRef} type="hidden" name="content" defaultValue={JSON.stringify({ code: initialCode })} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          {/* Code editor */}
          <div>
            <label className="block text-sm font-medium themed-secondary mb-1">
              Animation code (JavaScript)
            </label>
            <div className="themed-border border rounded overflow-hidden">
              <CodeMirror
                value={code}
                height="600px"
                theme={isDark ? vscodeDark : "light"}
                extensions={[javascript()]}
                onChange={setCode}
              />
            </div>
            {errors?.content && <p className="text-xs text-red-500 mt-1">{errors.content[0]}</p>}
          </div>

          {/* Right panel */}
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium themed-secondary mb-1">Name</label>
              <input id="name" name="name" type="text" required maxLength={200} defaultValue={name} className="themed-input w-full" />
              {errors?.name && <p className="text-xs text-red-500 mt-1">{errors.name[0]}</p>}
            </div>

            <div>
              <label htmlFor="slug" className="block text-sm font-medium themed-secondary mb-1">Slug</label>
              <input
                id="slug"
                name="slug"
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="themed-input w-full font-mono text-sm"
              />
              <p className="text-xs themed-muted mt-1">Must start with <code>anim-</code>. Renaming changes the URL and any references.</p>
              {errors?.slug && <p className="text-xs text-red-500 mt-1">{errors.slug[0]}</p>}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium themed-secondary mb-1">
                Description <span className="themed-muted font-normal">(optional)</span>
              </label>
              <textarea id="description" name="description" rows={2} maxLength={1000} defaultValue={description} className="themed-input w-full resize-y" />
            </div>

            <div className="flex items-center gap-4">
              <button type="submit" disabled={isPending} className="themed-btn-accent rounded-lg disabled:opacity-50">
                {isPending ? "Saving…" : "Save changes"}
              </button>
              <Link href={`/${publisherSlug}/objects/${savedSlug}`} className="text-sm themed-link">Done</Link>
            </div>
            {errors?._form && <p className="text-xs text-red-500">{errors._form[0]}</p>}

            <div>
              <p className="text-xs themed-muted mb-2">Preview (last saved)</p>
              {previewSrc ? (
                <iframe
                  key={`${savedSlug}-${previewVersion}`}
                  src={previewSrc}
                  sandbox="allow-scripts"
                  className="w-full themed-border border rounded"
                  style={{ height: 300 }}
                  title={`Preview: ${savedSlug}`}
                />
              ) : (
                <div className="themed-muted text-xs">Loading preview…</div>
              )}
            </div>
          </div>
        </div>
      </form>

      <hr className="themed-border" />

      <div>
        <h2 className="text-lg font-semibold themed-heading mb-2">Danger zone</h2>
        {confirmDelete ? (
          <form action={deleteAction} className="flex items-center gap-3">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="slug" value={savedSlug} />
            <p className="text-sm text-red-600 dark:text-red-400">Delete this object permanently?</p>
            <button type="submit" className="text-sm font-medium text-red-600 dark:text-red-400 underline">Yes, delete</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-sm themed-link">Cancel</button>
          </form>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm text-red-600 dark:text-red-400 underline">
            Delete object
          </button>
        )}
      </div>
    </div>
  );
}
