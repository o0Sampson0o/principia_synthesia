"use client";
import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { MarkdownMath } from "@/lib/codemirror-math";
import { MarkdownWikilink } from "@/lib/codemirror-wikilink";
import { grammarChecker } from "@/lib/codemirror-grammar";
import { htmlTagLinter } from "@/lib/codemirror-tag-lint";
import { livePreview } from "@/lib/live-preview";
import { editorTheme } from "@/lib/live-preview/theme";
import { slashMenu } from "@/lib/live-preview/slash-menu";
import { turnIntoKeymap } from "@/lib/live-preview/turn-into";
import CheckMdxButton from "./CheckMdxButton";
import { findMissingAlt } from "@/lib/alt-text-lint";
import type { AltTextFinding } from "@/lib/alt-text-lint";
import { previewMdx } from "@/app/[publisher]/articles/actions";
import MdxCompileError from "@/components/MdxCompileError";
import type { MdxErrorDetail } from "@/lib/mdx-error";
import { usePreviewEmbeds } from "@/components/PreviewEmbeds";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

const MODE_STORAGE_KEY = "ps:editor-mode";
const MODES = ["live", "source", "preview"] as const;
type EditorMode = (typeof MODES)[number];

type PreviewState =
  | { status: "loading" }
  | { status: "ok"; html: string }
  | { status: "error"; detail: MdxErrorDetail };

export interface ContentEditorRef {
  compile: () => void;
  insertText: (text: string) => void;
  getValue: () => string;
  setValue: (text: string) => void;
}

export default forwardRef<ContentEditorRef, {
  /** The article BODY (frontmatter is owned by the Frontmatter panel, not shown here). */
  initial: string;
  publisherSlug: string;
  onChange?: (value: string) => void;
  onError?: (hasError: boolean) => void;
  toolbar?: React.ReactNode;
  /**
   * Returns the FULL source (frontmatter + body) for Preview / Check-MDX so the
   * rendered output matches what publishes (canvas prepend, etc.). Falls back to
   * the body alone when not provided.
   */
  getPreviewSource?: () => string;
  /** Lets Preview inherit the parent book's KaTeX macros, as the book route does. */
  articleId?: number;
}>(function ContentEditor({ initial, publisherSlug, onChange, onError, toolbar, getPreviewSource, articleId }, ref) {
  const contentValue = useRef<string>(initial);
  const [altFindings, setAltFindings] = useState<AltTextFinding[]>([]);
  const [showAltList, setShowAltList] = useState(false);
  const altLintTimer = useRef<NodeJS.Timeout | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [grammarOn, setGrammarOn] = useState(false);
  const [mode, setMode] = useState<EditorMode>("live");
  const modeRef = useRef<EditorMode>("live");
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "loading" });
  // Preview HTML leaves holes where a component has to run in the browser;
  // this fills them with the real components. See components/PreviewEmbeds.tsx.
  const previewHtml =
    mode === "preview" && previewState.status === "ok" ? previewState.html : null;
  const previewProps = usePreviewEmbeds(previewHtml);

  // Grammar checking and the editing mode are reconfigured in place (rather
  // than re-rendering the editor) so toggling never disturbs the document,
  // cursor, scroll position, or undo history. In Preview mode the CodeMirror
  // view stays mounted (just hidden) for the same reason.
  const grammarCompartment = useMemo(() => new Compartment(), []);
  const modeCompartment = useMemo(() => new Compartment(), []);

  const applyMode = useCallback((next: EditorMode, view?: EditorView | null) => {
    modeRef.current = next;
    setMode(next);
    (view ?? editorViewRef.current)?.dispatch({
      effects: modeCompartment.reconfigure(next === "live" ? livePreview() : []),
    });
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // private browsing — preference just doesn't persist
    }
  }, [modeCompartment]);

  // Ctrl/Cmd+E cycles Live → Source → Preview → Live.
  const toggleMode = useCallback(() => {
    const next = MODES[(MODES.indexOf(modeRef.current) + 1) % MODES.length];
    applyMode(next);
  }, [applyMode]);

  // Compile the document through the real server pipeline when entering
  // Preview mode (fresh on every entry).
  useEffect(() => {
    if (mode !== "preview") return;
    let cancelled = false;
    setPreviewState({ status: "loading" });
    (async () => {
      try {
        const result = await previewMdx(publisherSlug, getPreviewSource?.() ?? contentValue.current, articleId);
        if (cancelled) return;
        if ("error" in result) {
          setPreviewState({ status: "error", detail: result.error });
          onError?.(true);
        } else {
          setPreviewState({ status: "ok", html: result.html });
          onError?.(false);
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewState({
            status: "error",
            detail: {
              reason: err instanceof Error ? err.message : String(err),
              line: null,
              column: null,
              frame: null,
            },
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, onError, publisherSlug, getPreviewSource, articleId]);

  // The in-editor keymap can't fire while CodeMirror is hidden — handle
  // Ctrl/Cmd+E at the window level when previewing so the cycle continues.
  useEffect(() => {
    if (mode !== "preview") return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        toggleMode();
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [mode, toggleMode]);

  const extensions = useMemo(() => [
    markdown({
      base: markdownLanguage,
      extensions: [...MarkdownMath, MarkdownWikilink],
    }),
    EditorView.lineWrapping,
    editorTheme,
    slashMenu,
    turnIntoKeymap,
    htmlTagLinter(),
    grammarCompartment.of([]),
    modeCompartment.of(livePreview()),
    keymap.of([
      {
        key: "Mod-e",
        run: () => {
          toggleMode();
          return true;
        },
      },
    ]),
  ], [grammarCompartment, modeCompartment, toggleMode]);

  const toggleGrammar = useCallback(() => {
    setGrammarOn((on) => {
      const next = !on;
      editorViewRef.current?.dispatch({
        effects: grammarCompartment.reconfigure(next ? grammarChecker() : []),
      });
      return next;
    });
  }, [grammarCompartment]);

  useEffect(() => {
    setAltFindings(findMissingAlt(initial));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback((val: string) => {
    contentValue.current = val;
    onChange?.(val);

    if (altLintTimer.current) {
      clearTimeout(altLintTimer.current);
    }
    altLintTimer.current = setTimeout(() => {
      setAltFindings(findMissingAlt(val));
    }, 800);
  }, [onChange]);

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

  // Full source (frontmatter + body) for Preview / Check-MDX.
  const handleGetSource = useCallback(
    () => getPreviewSource?.() ?? contentValue.current,
    [getPreviewSource]
  );

  const handleSetValue = useCallback((text: string) => {
    const view = editorViewRef.current;
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    }
    contentValue.current = text;
    setAltFindings(findMissingAlt(text));
  }, []);

  // The ref's compile() contract now points at the server-side MDX check.
  const checkTriggerRef = useRef<(() => void) | null>(null);
  const handleCompile = useCallback(() => {
    checkTriggerRef.current?.();
  }, []);

  useImperativeHandle(ref, () => ({
    compile: handleCompile,
    insertText: handleInsertText,
    getValue: handleGetValue,
    setValue: handleSetValue,
  }));

  return (
    <div data-tour="editor-content">
      {altFindings.length > 0 && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowAltList((v) => !v)}
            aria-label={`${altFindings.length} image${altFindings.length === 1 ? "" : "s"} missing alt text`}
            className="inline-flex items-center gap-1.5 themed-badge"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: "0.6875rem",
              letterSpacing: "0.03em",
              padding: "0.24rem 0.6rem",
              color: "var(--color-warning)",
              borderColor: "color-mix(in srgb, var(--color-warning) 45%, var(--border))",
              background: "color-mix(in srgb, var(--color-warning) 9%, var(--surface))",
            }}
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

      {/* ── Single-panel editor (live preview renders in place) ── */}
      <div className="flex flex-col min-h-0 overflow-hidden rounded-lg border themed-border h-[calc(100svh-12rem)] lg:h-[760px]">
        <div className="flex items-center justify-between px-3 py-1.5 border-b themed-border themed-surface shrink-0">
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label="Editor mode (Ctrl+E cycles)"
              className="flex items-center rounded border themed-border overflow-hidden"
            >
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => applyMode(m)}
                  aria-pressed={mode === m}
                  title={`${m === "live" ? "Live preview" : m === "source" ? "Source" : "Rendered preview"} (Ctrl+E cycles)`}
                  className={`px-2.5 py-0.5 transition-colors ${
                    mode === m ? "themed-accent font-semibold" : "themed-muted themed-hover-foreground"
                  }`}
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    background:
                      mode === m
                        ? "color-mix(in srgb, var(--accent) 14%, var(--surface))"
                        : "transparent",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleGrammar}
              aria-pressed={grammarOn}
              title="Grammar & spell check"
              className={`px-2.5 py-0.5 rounded-md border transition-colors ${
                grammarOn ? "themed-accent-border themed-accent" : "themed-border themed-muted themed-hover-foreground"
              }`}
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: "0.6875rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                background: grammarOn
                  ? "color-mix(in srgb, var(--accent) 10%, var(--surface))"
                  : "transparent",
              }}
            >
              Grammar {grammarOn ? "on" : "off"}
            </button>
            <CheckMdxButton publisherSlug={publisherSlug} getSource={handleGetSource} onError={onError} triggerRef={checkTriggerRef} articleId={articleId} />
          </div>
          {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        </div>
        <CodeMirror
          value={initial}
          height="100%"
          theme="none"
          extensions={extensions}
          onChange={handleChange}
          onCreateEditor={(view) => {
            editorViewRef.current = view;
            // Restore the persisted mode once the view exists (default: live).
            let saved: EditorMode = "live";
            try {
              const stored = localStorage.getItem(MODE_STORAGE_KEY);
              if (stored && (MODES as readonly string[]).includes(stored)) {
                saved = stored as EditorMode;
              }
            } catch {
              // ignore
            }
            if (saved !== modeRef.current) applyMode(saved, view);
          }}
          className={mode === "preview" ? "hidden" : "overflow-hidden flex-1"}
        />
        {mode === "preview" && (
          <div className="overflow-y-auto flex-1 px-5 py-5">
            <div className="mx-auto" style={{ maxWidth: "52rem" }}>
              {previewState.status === "loading" && (
                <p className="themed-muted" style={{ fontSize: "0.875rem" }}>
                  Rendering…
                </p>
              )}
              {previewState.status === "error" && (
                <MdxCompileError detail={previewState.detail} />
              )}
              {previewState.status === "ok" && (
                <div className="markdown-content" {...previewProps} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
