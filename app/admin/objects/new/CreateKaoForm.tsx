"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { createKaoObject } from "../actions";
import AnimationApiRef from "../AnimationApiRef";
import DiagramRenderer from "@/components/DiagramRenderer";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

const INITIAL_CONTENT: Record<string, string> = {
  animation: "",
  dataset: JSON.stringify({ headers: ["x", "y"], rows: [[1, 2], [3, 4]] }, null, 2),
  diagram: JSON.stringify({ format: "mermaid", source: "graph TD;\n  A-->B;" }, null, 2),
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseDataset(text: string) {
  try {
    const v = JSON.parse(text);
    if (Array.isArray(v?.headers) && Array.isArray(v?.rows))
      return v as { headers: string[]; rows: unknown[][] };
    return null;
  } catch { return null; }
}

function parseDiagram(text: string) {
  try {
    const v = JSON.parse(text);
    if (typeof v?.format === "string" && typeof v?.source === "string")
      return v as { format: string; source: string };
    return null;
  } catch { return null; }
}

export default function CreateKaoForm() {
  const [state, formAction] = useActionState(createKaoObject, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState("animation");
  const [editorContent, setEditorContent] = useState(INITIAL_CONTENT["animation"]);
  const [isDark, setIsDark] = useState(false);
  const contentRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    setEditorContent(INITIAL_CONTENT[type] ?? "");
  }, [type]);

  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.value =
      type === "animation"
        ? JSON.stringify({ code: editorContent })
        : editorContent;
  }, [editorContent, type]);

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setName(val);
    setSlug(slugify(val));
  }

  const extension = type === "animation" ? javascript() : json();
  const parsedDataset = type === "dataset" ? parseDataset(editorContent) : null;
  const parsedDiagram = type === "diagram" ? parseDiagram(editorContent) : null;

  return (
    <form action={formAction} className="space-y-4">
      <input
        ref={contentRef}
        type="hidden"
        name="content"
        defaultValue={type === "animation" ? JSON.stringify({ code: "" }) : (INITIAL_CONTENT[type] ?? "{}")}
      />

      {/* Identity strip — name, slug, type */}
      <div className="flex gap-3 items-end">
        <div className="flex-[2] min-w-0">
          <label className="block text-xs font-medium themed-secondary mb-1">Name</label>
          <input
            name="name"
            value={name}
            onChange={handleNameChange}
            required
            className="themed-input text-sm w-full"
            placeholder="My Object"
          />
          {state?.errors?.name && (
            <p className="text-xs text-red-500 mt-1">{state.errors.name[0]}</p>
          )}
        </div>
        <div className="flex-[2] min-w-0">
          <label className="block text-xs font-medium themed-secondary mb-1">Slug</label>
          <input
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className="themed-input text-sm w-full font-mono"
            placeholder="my-object"
          />
          {state?.errors?.slug && (
            <p className="text-xs text-red-500 mt-1">{state.errors.slug[0]}</p>
          )}
        </div>
        <div className="flex-[1] min-w-0">
          <label className="block text-xs font-medium themed-secondary mb-1">Type</label>
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="themed-input text-sm w-full"
          >
            <option value="animation">Animation</option>
            <option value="dataset">Dataset</option>
            <option value="diagram">Diagram</option>
          </select>
          {state?.errors?.type && (
            <p className="text-xs text-red-500 mt-1">{state.errors.type[0]}</p>
          )}
        </div>
      </div>

      {/* API reference — only for animation */}
      {type === "animation" && <AnimationApiRef />}

      {/* Editor — full width */}
      <div className="themed-border border rounded overflow-hidden">
        <CodeMirror
          value={editorContent}
          height="480px"
          theme={isDark ? vscodeDark : "light"}
          extensions={[extension]}
          onChange={setEditorContent}
        />
      </div>

      {/* Description — below editor, lower priority */}
      <div>
        <label className="block text-xs font-medium themed-secondary mb-1">
          Description <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <textarea
          name="description"
          rows={2}
          className="themed-input text-sm w-full"
          placeholder="A short description of this object"
        />
      </div>

      {/* Live preview */}
      {(type === "dataset" || type === "diagram") && (
        <div>
          <p className="text-xs themed-muted mb-2">
            Preview{type === "diagram" && parsedDiagram ? ` — ${parsedDiagram.format}` : ""}
          </p>
          {type === "dataset" && (
            parsedDataset ? (
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse w-full">
                  <thead>
                    <tr>
                      {parsedDataset.headers.map((h, i) => (
                        <th key={i} className="border themed-border px-3 py-2 text-left font-semibold bg-zinc-50 dark:bg-zinc-800">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedDataset.rows.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        {(row as unknown[]).map((cell, j) => (
                          <td key={j} className="border themed-border px-3 py-2">{String(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedDataset.rows.length > 10 && (
                  <p className="text-xs themed-muted mt-2">Showing 10 of {parsedDataset.rows.length} rows</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 italic">Invalid JSON — fix to see preview</p>
            )
          )}
          {type === "diagram" && (
            parsedDiagram ? (
              <DiagramRenderer format={parsedDiagram.format} source={parsedDiagram.source} />
            ) : (
              <p className="text-xs text-zinc-400 italic">Invalid JSON — fix to see preview</p>
            )
          )}
        </div>
      )}

      {state?.errors?.content && (
        <p className="text-xs text-red-500">{state.errors.content[0]}</p>
      )}

      <button
        type="submit"
        className="px-4 py-2 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
      >
        Create object
      </button>
    </form>
  );
}
