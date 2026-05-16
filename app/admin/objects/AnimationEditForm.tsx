"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { updateKaoObject } from "./actions";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { javascript } from "@codemirror/lang-javascript";
import { buildAnimationSrc } from "@/lib/useAnimationSrc";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

interface Props {
  object: {
    id: number;
    slug: string;
    name: string;
    content: unknown;
    description: string | null;
  };
}

export default function AnimationEditForm({ object }: Props) {
  const initialCode = (object.content as { code?: string }).code ?? "";
  const [code, setCode] = useState(initialCode);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [state, formAction, isPending] = useActionState(updateKaoObject, null);
  const contentRef = useRef<HTMLInputElement>(null);
  const wasPending = useRef(false);

  // Dark mode detection for editor theme
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Keep hidden input in sync with CodeMirror value
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.value = JSON.stringify({ code });
    }
  }, [code]);

  // Bump preview only after save completes
  useEffect(() => {
    if (wasPending.current && !isPending && !state?.errors) {
      setPreviewVersion((v) => v + 1);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  const previewSrc = previewVersion > 0
    ? buildAnimationSrc(object.slug, previewVersion)
    : null;

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={object.id} />
      <input type="hidden" name="slug" value={object.slug} />
      <input type="hidden" name="type" value="animation" />
      {/* Updated by useEffect whenever code changes */}
      <input
        ref={contentRef}
        type="hidden"
        name="content"
        defaultValue={JSON.stringify({ code: initialCode })}
      />

      <div className="grid grid-cols-[1fr_300px] gap-4" style={{ height: 600 }}>
        {/* CodeMirror */}
        <div className="themed-border border rounded overflow-hidden">
          <CodeMirror
            value={code}
            height="600px"
            theme={isDark ? vscodeDark : "light"}
            extensions={[javascript()]}
            onChange={setCode}
          />
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium themed-secondary mb-1">Name</label>
            <input
              name="name"
              defaultValue={object.name}
              className="themed-input text-sm w-full"
            />
            {state?.errors?.name && (
              <p className="text-xs text-red-500 mt-1">{state.errors.name[0]}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium themed-secondary mb-1">
              Description <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <textarea
              name="description"
              rows={3}
              defaultValue={object.description ?? ""}
              className="themed-input text-sm w-full"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>

          {state?.errors?._form && (
            <p className="text-xs text-red-500">{state.errors._form[0]}</p>
          )}

          <div className="flex-1 min-h-0">
            <p className="text-xs themed-muted mb-2">
              Preview{previewVersion === 0 ? " — save to load" : ""}
            </p>
            {previewSrc && (
              <iframe
                key={previewVersion}
                src={previewSrc}
                className="w-full themed-border border rounded"
                style={{ height: 280 }}
                title={`Preview: ${object.slug}`}
              />
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
