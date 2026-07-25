"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { javascript } from "@codemirror/lang-javascript";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";

const DiagramEditor = dynamic(() => import("./DiagramEditor"), { ssr: false });
const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

type KaoType = "animation" | "dataset" | "diagram";

export default function NewObjectFormClient() {
  const [type, setType] = useState<KaoType>("animation");
  const [code, setCode] = useState("");
  const [isDark, setIsDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const contentRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Keep the hidden `content` field ({ code }) in sync while editing an animation.
  useEffect(() => {
    if (contentRef.current) contentRef.current.value = JSON.stringify({ code });
  }, [code]);

  return (
    <>
      <div>
        <label htmlFor="type" className="block text-sm font-medium themed-secondary mb-1">
          Type
        </label>
        <select
          id="type"
          name="type"
          className="themed-input"
          required
          value={type}
          onChange={(e) => setType(e.target.value as KaoType)}
        >
          <option value="animation">Animation (anim-)</option>
          <option value="dataset">Dataset (object-)</option>
          <option value="diagram">Diagram (object-)</option>
        </select>
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium themed-secondary mb-1">
          Slug
        </label>
        <input
          id="slug"
          name="slug"
          type="text"
          required
          placeholder={type === "animation" ? "anim-my-animation" : "object-my-object"}
          className="themed-input"
        />
        <p className="text-xs themed-muted mt-1">
          Animations: &ldquo;anim-&rdquo; prefix. Others: &ldquo;object-&rdquo; prefix.
        </p>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium themed-secondary mb-1">
          Name
        </label>
        <input id="name" name="name" type="text" required maxLength={200} className="themed-input" />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium themed-secondary mb-1">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          maxLength={1000}
          className="themed-input w-full resize-y"
        />
      </div>

      {type === "diagram" ? (
        <DiagramEditor initialFormat="mermaid" initialSource="" nameInputId="name" />
      ) : type === "animation" ? (
        <div>
          <label className="block text-sm font-medium themed-secondary mb-1">
            Animation code (JavaScript)
          </label>
          <input ref={contentRef} type="hidden" name="content" defaultValue={JSON.stringify({ code: "" })} />
          <div className="themed-border border rounded overflow-hidden">
            <CodeMirror
              value={code}
              height="400px"
              theme={isDark ? vscodeDark : "light"}
              extensions={[javascript()]}
              onChange={setCode}
            />
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="content" className="block text-sm font-medium themed-secondary mb-1">
            Content (JSON)
          </label>
          <textarea
            id="content"
            name="content"
            rows={15}
            required
            className="themed-input w-full font-mono text-sm resize-y"
            placeholder='{"headers": ["Col A", "Col B"], "rows": [["val1", "val2"]]}'
          />
        </div>
      )}
    </>
  );
}
