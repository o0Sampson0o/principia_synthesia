import type { MdxErrorDetail } from "@/lib/mdx-error";

/**
 * The editor-facing compile diagnostic: reason, position, and a code frame in
 * the author's own line numbers, so it can be read straight against the
 * CodeMirror gutter.
 *
 * Shared by the Preview pane and the "Check MDX" dialog so the two never drift.
 * The reader-facing equivalent is `MdxErrorNotice` — deliberately separate,
 * since readers get calm copy and no internals.
 */
export default function MdxCompileError({ detail }: { detail: MdxErrorDetail }) {
  return (
    <div className="flex flex-col gap-2">
      <p
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: "0.8125rem",
          color: "var(--color-error)",
        }}
      >
        {detail.reason}
        {detail.line !== null && (
          <span className="themed-muted">
            {" "}
            (line {detail.line}
            {detail.column !== null ? `, column ${detail.column}` : ""})
          </span>
        )}
      </p>

      {detail.frame ? (
        <pre
          className="whitespace-pre overflow-x-auto themed-surface border themed-border rounded-lg px-3 py-2"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "0.75rem",
            lineHeight: 1.6,
          }}
        >
          {detail.frame}
        </pre>
      ) : (
        <p className="themed-muted" style={{ fontSize: "0.75rem" }}>
          The compiler reported no position for this error.
        </p>
      )}

      <p className="themed-muted" style={{ fontSize: "0.75rem" }}>
        This is where parsing broke, which can sit below the actual mistake — an
        unclosed <code>$$</code> fence or JSX tag reports at the first line it
        can no longer make sense of. If the flagged line looks correct, scroll up
        to the nearest delimiter.
      </p>
    </div>
  );
}
