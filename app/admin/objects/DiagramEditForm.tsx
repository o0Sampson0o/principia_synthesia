"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { updateKaoObject } from "./actions";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { json } from "@codemirror/lang-json";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

interface DiagramContent {
  format: string;
  source: string;
}

interface Props {
  object: {
    id: number;
    slug: string;
    name: string;
    content: unknown;
    description: string | null;
  };
}

function parseDiagram(text: string): DiagramContent | null {
  try {
    const v = JSON.parse(text);
    if (typeof v?.format === "string" && typeof v?.source === "string") return v as DiagramContent;
    return null;
  } catch {
    return null;
  }
}

export default function DiagramEditForm({ object }: Props) {
  const initialJson = JSON.stringify(object.content, null, 2);
  const [jsonText, setJsonText] = useState(initialJson);
  const [isDark, setIsDark] = useState(false);
  const [state, formAction, isPending] = useActionState(updateKaoObject, null);
  const contentRef = useRef<HTMLInputElement>(null);

  const parsed = parseDiagram(jsonText);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (contentRef.current) contentRef.current.value = jsonText;
  }, [jsonText]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={object.id} />
      <input type="hidden" name="slug" value={object.slug} />
      <input type="hidden" name="type" value="diagram" />
      <input ref={contentRef} type="hidden" name="content" defaultValue={initialJson} />

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

      {/* Editor — full width */}
      <div className="themed-border border rounded overflow-hidden">
        <CodeMirror
          value={jsonText}
          height="480px"
          theme={isDark ? vscodeDark : "light"}
          extensions={[json()]}
          onChange={setJsonText}
        />
      </div>

      {/* Live preview */}
      <div>
        <p className="text-xs themed-muted mb-2">
          Preview{parsed ? ` — ${parsed.format}` : ""}
        </p>
        {parsed ? (
          <pre className="bg-zinc-50 dark:bg-zinc-800 rounded border themed-border p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
            {parsed.source}
          </pre>
        ) : (
          <p className="text-xs text-zinc-400 italic">
            Invalid JSON — fix to see preview
          </p>
        )}
      </div>
    </form>
  );
}
