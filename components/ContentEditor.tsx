"use client";
import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import type { EditorView } from "@codemirror/view";
import Preview from "./Preview";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full border rounded bg-zinc-50 dark:bg-zinc-900 animate-pulse" />
  ),
});

export interface ContentEditorRef {
  compile: () => void;
  insertText: (text: string) => void;
  getValue: () => string;
  setValue: (text: string) => void;
}

export default forwardRef<ContentEditorRef, {
  initial: string;
  onChange?: (value: string) => void;
  onError?: (hasError: boolean) => void;
  toolbar?: React.ReactNode;
}>(function ContentEditor({ initial, onChange, onError, toolbar }, ref) {
  const contentValue = useRef<string>(initial);
  const [isDark, setIsDark] = useState(false);
  const previewRef = useRef<{ updateSource: (src: string) => void } | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);

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

  const handleInsertText = useCallback((text: string) => {
    const view = editorViewRef.current;
    if (view) {
      const cursor = view.state.selection.main.head;
      view.dispatch({
        changes: { from: cursor, to: cursor, insert: text },
        selection: { anchor: cursor + text.length },
      });
      view.focus();
    }
  }, []);

  const handleGetValue = useCallback(() => contentValue.current, []);

  const handleSetValue = useCallback((text: string) => {
    const view = editorViewRef.current;
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    }
    contentValue.current = text;
    const field = document.getElementById("content-field") as HTMLInputElement | null;
    if (field) field.value = text;
    previewRef.current?.updateSource(text);
  }, []);

  // Expose compile, insertText, getValue, setValue to parent
  useImperativeHandle(ref, () => ({
    compile: handleCompile,
    insertText: handleInsertText,
    getValue: handleGetValue,
    setValue: handleSetValue,
  }));

  return (
    <>
      <input type="hidden" name="content" id="content-field" />
      <div className="grid grid-cols-2 gap-4 h-[640px]">
        <div className="flex flex-col">
          {toolbar && (
            <div className="flex items-center justify-between px-2 py-1 mb-1 border rounded-t bg-zinc-50 dark:bg-zinc-900 border-b-0">
              <span className="text-xs themed-muted">MDX</span>
              <div className="flex items-center gap-2">{toolbar}</div>
            </div>
          )}
          <CodeMirror
            value={initial}
            height={toolbar ? "608px" : "640px"}
            theme={theme}
            extensions={extensions}
            onChange={handleChange}
            onCreateEditor={(view) => { editorViewRef.current = view; }}
            className={toolbar ? "border border-t-0 rounded-b overflow-hidden flex-1" : "border rounded overflow-hidden flex-1"}
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
