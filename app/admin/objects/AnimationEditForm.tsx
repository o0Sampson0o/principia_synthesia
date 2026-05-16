"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { updateKaoObject } from "./actions";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { javascript } from "@codemirror/lang-javascript";
import { buildAnimationSrc } from "@/lib/useAnimationSrc";
import AnimationApiRef from "./AnimationApiRef";

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

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (contentRef.current) contentRef.current.value = JSON.stringify({ code });
  }, [code]);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.errors) {
      setPreviewVersion((v) => v + 1);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  const previewSrc = previewVersion > 0 ? buildAnimationSrc(object.slug, previewVersion) : null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={object.id} />
      <input type="hidden" name="slug" value={object.slug} />
      <input type="hidden" name="type" value="animation" />
      <input
        ref={contentRef}
        type="hidden"
        name="content"
        defaultValue={JSON.stringify({ code: initialCode })}
      />

      {/* Metadata strip */}
      <div className="flex gap-3 items-end">
        <div className="flex-[1] min-w-0">
          <label className="block text-xs font-medium themed-secondary mb-1">Name</label>
          <input name="name" defaultValue={object.name} className="themed-input text-sm w-full" />
          {state?.errors?.name && (
            <p className="text-xs text-red-500 mt-1">{state.errors.name[0]}</p>
          )}
        </div>
        <div className="flex-[2] min-w-0">
          <label className="block text-xs font-medium themed-secondary mb-1">
            Description <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            name="description"
            defaultValue={object.description ?? ""}
            className="themed-input text-sm w-full"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 px-4 py-2 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      {state?.errors?._form && (
        <p className="text-xs text-red-500">{state.errors._form[0]}</p>
      )}

      {/* Contextual API reference */}
      <AnimationApiRef />

      {/* Editor — full width */}
      <div className="themed-border border rounded overflow-hidden">
        <CodeMirror
          value={code}
          height="480px"
          theme={isDark ? vscodeDark : "light"}
          extensions={[javascript()]}
          onChange={setCode}
        />
      </div>

      {/* Preview */}
      <div>
        <p className="text-xs themed-muted mb-2">
          Preview{previewVersion === 0 ? " — save to load" : ""}
        </p>
        {previewSrc && (
          <iframe
            key={previewVersion}
            src={previewSrc}
            className="w-full themed-border border rounded"
            style={{ height: 360 }}
            title={`Preview: ${object.slug}`}
          />
        )}
      </div>
    </form>
  );
}
