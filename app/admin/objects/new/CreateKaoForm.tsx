"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { createKaoObject } from "../actions";
import AnimationApiRef from "../AnimationApiRef";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { javascript } from "@codemirror/lang-javascript";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

const CONTENT_PLACEHOLDERS: Record<string, string> = {
  animation: JSON.stringify({ code: "function MyAnim() { /* ... */ }" }, null, 2),
  dataset: JSON.stringify({ headers: ["x", "y"], rows: [[1, 2], [3, 4]] }, null, 2),
  diagram: JSON.stringify({ format: "mermaid", source: "graph TD; A-->B;" }, null, 2),
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function CreateKaoForm() {
  const [state, formAction] = useActionState(createKaoObject, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<string>("animation");
  const [animCode, setAnimCode] = useState("");
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
    if (type === "animation" && contentRef.current) {
      contentRef.current.value = JSON.stringify({ code: animCode });
    }
  }, [animCode, type]);

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setName(val);
    setSlug(slugify(val));
  }

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Name
        </label>
        <input
          name="name"
          value={name}
          onChange={handleNameChange}
          required
          className="themed-input"
          placeholder="My Object"
        />
        {state?.errors?.name && (
          <p className="text-xs text-red-500 mt-1">{state.errors.name[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Slug
        </label>
        <input
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          className="themed-input font-mono"
          placeholder="my-object"
        />
        {state?.errors?.slug && (
          <p className="text-xs text-red-500 mt-1">{state.errors.slug[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Type
        </label>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="themed-input"
        >
          <option value="animation">Animation</option>
          <option value="dataset">Dataset</option>
          <option value="diagram">Diagram</option>
        </select>
        {state?.errors?.type && (
          <p className="text-xs text-red-500 mt-1">{state.errors.type[0]}</p>
        )}
      </div>

      {type === "animation" && <AnimationApiRef />}

      {type === "animation" ? (
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Animation code
          </label>
          <input
            ref={contentRef}
            type="hidden"
            name="content"
            defaultValue={JSON.stringify({ code: "" })}
          />
          <div className="themed-border border rounded overflow-hidden" style={{ height: 400 }}>
            <CodeMirror
              value={animCode}
              height="400px"
              theme={isDark ? vscodeDark : "light"}
              extensions={[javascript()]}
              onChange={setAnimCode}
            />
          </div>
          {state?.errors?.content && (
            <p className="text-xs text-red-500 mt-1">{state.errors.content[0]}</p>
          )}
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Content (JSON)
          </label>
          <textarea
            name="content"
            rows={8}
            className="themed-input font-mono text-sm"
            placeholder={CONTENT_PLACEHOLDERS[type] ?? "{}"}
          />
          {state?.errors?.content && (
            <p className="text-xs text-red-500 mt-1">{state.errors.content[0]}</p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Description{" "}
          <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <textarea
          name="description"
          rows={3}
          className="themed-input text-sm"
          placeholder="A short description of this object"
        />
        {state?.errors?.description && (
          <p className="text-xs text-red-500 mt-1">{state.errors.description[0]}</p>
        )}
      </div>

      <button
        type="submit"
        className="px-4 py-2 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
      >
        Create object
      </button>
    </form>
  );
}
