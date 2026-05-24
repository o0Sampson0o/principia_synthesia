"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
const DiagramRenderer = dynamic(() => import("./DiagramRenderer"), { ssr: false });

type DiagramFormat = "mermaid" | "graphviz";

interface Props {
  initialFormat?: DiagramFormat;
  initialSource?: string;
  nameInputId?: string;
}

const MERMAID_PLACEHOLDER = `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Result A]
    B -->|No| D[Result B]`;

const GRAPHVIZ_PLACEHOLDER = `digraph G {
    A -> B;
    B -> C;
    A -> C;
}`;

export default function DiagramEditor({
  initialFormat = "mermaid",
  initialSource = "",
  nameInputId,
}: Props) {
  const [format, setFormat] = useState<DiagramFormat>(initialFormat);
  const [source, setSource] = useState(initialSource);
  const [previewSource, setPreviewSource] = useState(initialSource);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleSourceChange = useCallback((val: string) => {
    setSource(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setPreviewSource(val);
    }, 400);
  }, []);

  const handleFormatChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFormat = e.target.value as DiagramFormat;
    setFormat(newFormat);
    setPreviewSource(source);
  }, [source]);

  const placeholder = format === "mermaid" ? MERMAID_PLACEHOLDER : GRAPHVIZ_PLACEHOLDER;
  const renderedSource = previewSource || placeholder;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="diagram-format" className="block text-sm font-medium themed-secondary mb-1">
          Format
        </label>
        <select
          id="diagram-format"
          name="format"
          value={format}
          onChange={handleFormatChange}
          className="themed-input"
        >
          <option value="mermaid">Mermaid</option>
          <option value="graphviz">Graphviz (DOT)</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label htmlFor="diagram-source" className="block text-sm font-medium themed-secondary mb-1">
            Source
          </label>
          <input type="hidden" name="source" value={source} />
          <div
            id="diagram-source"
            className="themed-input p-0 overflow-hidden rounded"
            style={{ minHeight: "320px" }}
            aria-label="Diagram source editor"
          >
            <CodeMirror
              value={source}
              onChange={handleSourceChange}
              height="320px"
              theme={isDark ? "dark" : "light"}
              basicSetup={{ lineNumbers: true, foldGutter: false }}
            />
          </div>
          {!source && (
            <p className="text-xs themed-muted mt-1">
              Placeholder shown in preview. Enter source to use it.
            </p>
          )}
        </div>

        <div>
          <p className="block text-sm font-medium themed-secondary mb-1">
            Preview
          </p>
          <div
            className="themed-surface rounded border themed-border p-4 overflow-auto"
            style={{ minHeight: "320px" }}
            aria-live="polite"
            aria-label="Diagram preview"
          >
            {renderedSource.trim() ? (
              <DiagramRenderer format={format} source={renderedSource} />
            ) : (
              <p className="text-xs themed-muted">Enter source to see the diagram.</p>
            )}
          </div>
        </div>
      </div>

      {nameInputId && (
        <p className="text-xs themed-muted">
          The diagram will be saved under the name specified above.
        </p>
      )}
    </div>
  );
}
