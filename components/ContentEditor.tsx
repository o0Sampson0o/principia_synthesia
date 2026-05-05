"use client";
import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import Preview from "./Preview";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
});

export interface ContentEditorRef {
  compile: () => void;
}

export default forwardRef<ContentEditorRef, {
  initial: string;
  onChange?: (value: string) => void;
  onError?: (hasError: boolean) => void;
}>(function ContentEditor({ initial, onChange, onError }, ref) {
  const contentValue = useRef<string>(initial);
  const [isDark, setIsDark] = useState(false);
  const previewRef = useRef<{ updateSource: (src: string) => void } | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Simple extensions without loading all language data
  const extensions = useMemo(() => [
    markdown({
      base: markdownLanguage,
      // Don't load all languages - just markdown
    }),
  ], []);

  const theme = useMemo(() => isDark ? vscodeDark : "light", [isDark]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    mq.addEventListener("change", (e) => setIsDark(e.matches));
    return () => mq.removeEventListener("change", () => {});
  }, []);

  const handleChange = useCallback((val: string) => {
    contentValue.current = val;
    onChange?.(val);

    // Keep hidden input in sync
    const field = document.getElementById("content-field") as HTMLInputElement | null;
    if (field) field.value = val;

    // Debounce preview updates
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      previewRef.current?.updateSource(val);
    }, 500);
  }, [onChange]);

  const handleCompile = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    previewRef.current?.updateSource(contentValue.current);
  }, []);

  // Initialize hidden input on mount so form submits correctly even without editing
  useEffect(() => {
    const field = document.getElementById("content-field") as HTMLInputElement | null;
    if (field) field.value = initial;
  }, []);

  // Expose compile method to parent
  useImperativeHandle(ref, () => ({
    compile: handleCompile,
  }));

  return (
    <>
      <input type="hidden" name="content" id="content-field" />
      <div className="grid grid-cols-2 gap-4 h-[600px]">
        <div className="relative">
          <CodeMirror
            value={initial}
            height="600px"
            theme={theme}
            extensions={extensions}
            onChange={handleChange}
            className="border rounded overflow-hidden"
          />
        </div>
        <div className="border rounded p-4 overflow-y-auto max-w-none relative">
          <button
            type="button"
            onClick={handleCompile}
            className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            title="Force recompile preview"
          >
            Compile
          </button>
          <Preview
            ref={previewRef}
            initialSource={initial}
            onError={onError}
          />
        </div>
      </div>
    </>
  );
});
