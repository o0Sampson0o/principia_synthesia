"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { previewMdx } from "@/app/[publisher]/articles/actions";

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; html: string }
  | { status: "error"; message: string };

/**
 * Compile-check for the live-preview editor: runs the full server-side MDX
 * pipeline (previewMdx) as validation, since in-place rendering is a close
 * approximation rather than the exact publish pipeline. Result badge opens a
 * dialog with either the compile error or the rendered output.
 */
export default function CheckMdxButton({
  getSource,
  onError,
  triggerRef,
}: {
  getSource: () => string;
  onError?: (hasError: boolean) => void;
  /** Lets the parent invoke the check imperatively (ContentEditorRef.compile). */
  triggerRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<CheckState>({ status: "idle" });
  const dialogRef = useRef<HTMLDialogElement>(null);

  function handleCheck() {
    setState({ status: "checking" });
    startTransition(async () => {
      try {
        const result = await previewMdx(getSource());
        if ("error" in result) {
          setState({ status: "error", message: result.error });
          onError?.(true);
        } else {
          setState({ status: "ok", html: result.html });
          onError?.(false);
        }
      } catch (err) {
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        onError?.(true);
      }
    });
  }

  useEffect(() => {
    if (!triggerRef) return;
    triggerRef.current = handleCheck;
    return () => {
      triggerRef.current = null;
    };
  });

  return (
    <>
      <button
        type="button"
        onClick={handleCheck}
        disabled={isPending}
        className="themed-btn-ghost"
        style={{ fontSize: "0.6875rem", padding: "0.2rem 0.5rem" }}
        title="Compile the document through the full MDX pipeline"
      >
        {isPending ? "Checking…" : "Check MDX"}
      </button>

      {state.status === "ok" && (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="themed-badge"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "0.6875rem",
            letterSpacing: "0.03em",
            padding: "0.2rem 0.55rem",
            color: "var(--color-success)",
            borderColor: "color-mix(in srgb, var(--color-success) 45%, var(--border))",
            background: "color-mix(in srgb, var(--color-success) 9%, var(--surface))",
          }}
          title="Compiled cleanly — click to see the rendered output"
        >
          ✓ MDX OK
        </button>
      )}
      {state.status === "error" && (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="themed-badge"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "0.6875rem",
            letterSpacing: "0.03em",
            padding: "0.2rem 0.55rem",
            color: "var(--color-error)",
            borderColor: "color-mix(in srgb, var(--color-error) 45%, var(--border))",
            background: "color-mix(in srgb, var(--color-error) 9%, var(--surface))",
          }}
          title="Compile failed — click for details"
        >
          ✗ MDX error
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="themed-card w-[min(92vw,46rem)]"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex flex-col gap-3 max-h-[75svh]">
          <div className="flex items-center justify-between shrink-0">
            <p className="ps-eyebrow-muted">
              {state.status === "error" ? "MDX compile error" : "Compiled output"}
            </p>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="themed-btn-ghost"
              style={{ fontSize: "0.75rem" }}
            >
              Close
            </button>
          </div>
          <div className="overflow-y-auto min-h-0">
            {state.status === "error" && (
              <pre
                className="whitespace-pre-wrap"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: "0.8125rem",
                  color: "var(--color-error)",
                }}
              >
                {state.message}
              </pre>
            )}
            {state.status === "ok" && (
              <div
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: state.html }}
              />
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
