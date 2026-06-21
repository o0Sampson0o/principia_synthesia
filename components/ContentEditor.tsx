"use client";
import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { MarkdownMath } from "@/lib/codemirror-math";
import { grammarChecker } from "@/lib/codemirror-grammar";
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
  const [grammarOn, setGrammarOn] = useState(false);

  // Grammar checking is reconfigured in place (rather than re-rendering the
  // editor) so toggling it never disturbs the document or cursor.
  const grammarCompartment = useMemo(() => new Compartment(), []);

  const extensions = useMemo(() => [
    markdown({
      base: markdownLanguage,
      extensions: MarkdownMath,
    }),
    EditorView.lineWrapping,
    grammarCompartment.of([]),
  ], [grammarCompartment]);

  const toggleGrammar = useCallback(() => {
    setGrammarOn((on) => {
      const next = !on;
      editorViewRef.current?.dispatch({
        effects: grammarCompartment.reconfigure(next ? grammarChecker() : []),
      });
      return next;
    });
  }, [grammarCompartment]);

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
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowAltList((v) => !v)}
            aria-label={`${altFindings.length} image${altFindings.length === 1 ? "" : "s"} missing alt text`}
            className="inline-flex items-center gap-1.5 themed-badge"
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.625rem", borderColor: "var(--color-warning-border)", color: "var(--color-warning-border)" }}
          >
            <span aria-hidden="true">⚠</span>
            {altFindings.length} missing alt
          </button>
          {showAltList && (
            <ul className="flex flex-wrap gap-2">
              {altFindings.map((f) => (
                <li key={`${f.line}-${f.src}`} className="themed-muted" style={{ fontSize: "0.75rem" }}>
                  Line {f.line}{f.src ? `: ${f.src.slice(0, 40)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100svh-12rem)] lg:h-[760px]">

        {/* ── MDX editor pane ── */}
        <div className="flex flex-col min-h-0 overflow-hidden rounded-lg border themed-border">
          <div className="flex items-center justify-between px-3 py-1.5 border-b themed-border themed-surface shrink-0">
            <div className="flex items-center gap-2">
              <span className="themed-muted font-medium" style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>MDX</span>
              <button
                type="button"
                onClick={toggleGrammar}
                aria-pressed={grammarOn}
                title="Grammar & spell check"
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  grammarOn
                    ? "themed-accent-border themed-accent"
                    : "themed-border themed-muted themed-hover-foreground"
                }`}
                style={{ fontSize: "0.6875rem" }}
              >
                Grammar {grammarOn ? "on" : "off"}
              </button>
            </div>
            {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
          </div>
          <CodeMirror
            value={initial}
            height="100%"
            theme={theme}
            extensions={extensions}
            onChange={handleChange}
            onCreateEditor={(view) => { editorViewRef.current = view; }}
            className="overflow-hidden flex-1"
          />
        </div>

        {/* ── Preview pane ── */}
        <div className="rounded-lg border themed-border overflow-y-auto relative">
          <div className="flex items-center justify-between px-3 py-1.5 border-b themed-border themed-surface sticky top-0">
            <span className="themed-muted font-medium" style={{ fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>Preview</span>
            <button
              type="button"
              onClick={handleCompile}
              className="themed-btn-ghost"
              style={{ fontSize: "0.6875rem", padding: "0.2rem 0.5rem" }}
              title="Force recompile preview"
            >
              Compile
            </button>
          </div>
          <div className="p-5">
            <Preview
              ref={previewRef}
              initialSource={initial}
              onError={onError}
            />
          </div>
        </div>

      </div>
    </div>
  );
});
