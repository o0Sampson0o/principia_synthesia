"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { updateKaoObject } from "./actions";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { json } from "@codemirror/lang-json";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

interface DatasetContent {
  headers: string[];
  rows: unknown[][];
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

function parseDataset(text: string): DatasetContent | null {
  try {
    const v = JSON.parse(text);
    if (Array.isArray(v?.headers) && Array.isArray(v?.rows)) return v as DatasetContent;
    return null;
  } catch {
    return null;
  }
}

export default function DatasetEditForm({ object }: Props) {
  const initialJson = JSON.stringify(object.content, null, 2);
  const [jsonText, setJsonText] = useState(initialJson);
  const [isDark, setIsDark] = useState(false);
  const [state, formAction, isPending] = useActionState(updateKaoObject, null);
  const contentRef = useRef<HTMLInputElement>(null);

  const parsed = parseDataset(jsonText);

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
    <form action={formAction}>
      <input type="hidden" name="id" value={object.id} />
      <input type="hidden" name="slug" value={object.slug} />
      <input type="hidden" name="type" value="dataset" />
      <input ref={contentRef} type="hidden" name="content" defaultValue={initialJson} />

      <div className="grid grid-cols-[1fr_300px] gap-4" style={{ height: 600 }}>
        <div className="themed-border border rounded overflow-hidden">
          <CodeMirror
            value={jsonText}
            height="600px"
            theme={isDark ? vscodeDark : "light"}
            extensions={[json()]}
            onChange={setJsonText}
          />
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium themed-secondary mb-1">Name</label>
            <input name="name" defaultValue={object.name} className="themed-input text-sm w-full" />
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
            <p className="text-xs themed-muted mb-2">Preview</p>
            {parsed ? (
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr>
                      {parsed.headers.map((h, i) => (
                        <th
                          key={i}
                          className="border themed-border px-2 py-1 text-left font-semibold bg-zinc-50 dark:bg-zinc-800"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        {(row as unknown[]).map((cell, j) => (
                          <td key={j} className="border themed-border px-2 py-1">
                            {String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.rows.length > 10 && (
                  <p className="text-xs themed-muted mt-1">
                    Showing 10 of {parsed.rows.length} rows
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 italic">
                Invalid JSON — fix to see preview
              </p>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
