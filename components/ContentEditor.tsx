"use client";
import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import type { EditorView } from "@codemirror/view";
import Preview from "./Preview";
import { findMissingAlt } from "@/lib/alt-text-lint";
import type { AltTextFinding } from "@/lib/alt-text-lint";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

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
  const [altFindings, setAltFindings] = useState<AltTextFinding[]>([]);
  const [showAltList, setShowAltList] = useState(false);
  const previewRef = useRef<{ updateSource: (src: string) => void } | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const altLintTimer = useRef<NodeJS.Timeout | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const extensions = useMemo(() => [
    markdown({
      base: markdownLanguage,
    }),
  ], []);

  const theme = useMemo(() => isDark ? vscodeDark : "light", [isDark]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    mq.addEventListener("change", (e) => setIsDark(e.matches));
    return () => mq.removeEventListener("change", () => {});
  }, []);

  useEffect(() => {
    setAltFindings(findMissingAlt(initial));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback((val: string) => {
    contentValue.current = val;
    onChange?.(val);

    const field = document.getElementById("content-field") as HTMLInputElement | null;
    if (field) field.value = val;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      previewRef.current?.updateSource(val);
    }, 500);

    if (altLintTimer.current) {
      clearTimeout(altLintTimer.current);
    }
    altLintTimer.current = setTimeout(() => {
      setAltFindings(findMissingAlt(val));
    }, 800);
  }, [onChange]);

  const handleCompile = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    previewRef.current?.updateSource(contentValue.current);
  }, []);

  useEffect(() => {
    const field = document.getElementById("content-field") as HTMLInputElement | null;
    if (field) field.value = initial;
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setAltFindings(findMissingAlt(text));
  }, []);

  useImperativeHandle(ref, () => ({
    compile: handleCompile,
    insertText: handleInsertText,
    getValue: handleGetValue,
    setValue: handleSetValue,
  }));

  return (
    <div data-tour="editor-content">
      <input type="hidden" name="content" id="content-field" />
      {altFindings.length > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAltList((v) => !v)}
            aria-label={`${altFindings.length} image${altFindings.length === 1 ? "" : "s"} missing alt text`}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700 font-medium"
          >
            <span aria-hidden="true">!</span>
            {altFindings.length} missing alt
          </button>
          {showAltList && (
            <ul className="flex flex-wrap gap-2">
              {altFindings.map((f) => (
                <li key={`${f.line}-${f.src}`} className="text-xs themed-muted">
                  Line {f.line}{f.src ? `: ${f.src.slice(0, 40)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100svh-12rem)] lg:h-[760px]">
        <div className="flex flex-col">
          {toolbar && (
            <div className="flex items-center justify-between px-2 py-1 mb-1 border themed-border rounded-t themed-surface border-b-0">
              <span className="text-xs themed-muted">MDX</span>
              <div className="flex items-center gap-2">{toolbar}</div>
            </div>
          )}
          <CodeMirror
            value={initial}
            height="100%"
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
            className="absolute top-2 right-2 text-xs px-2 py-1 rounded themed-muted-bg themed-muted themed-hover-foreground transition-colors"
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
    </div>
  );
});
