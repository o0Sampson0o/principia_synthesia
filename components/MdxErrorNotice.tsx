import type { MdxErrorDetail } from "@/lib/mdx-error";

/**
 * The in-page stand-in for prose that could not be rendered.
 *
 * Shared by both failure paths so they look identical: the server-side compile
 * catch in `<ArticleBody>` and the client-side `<MdxErrorBoundary>`. Pure
 * presentation, no hooks — it renders in either environment.
 *
 * Readers get calm copy. Editors additionally get the compiler's reason and,
 * when the position survived, a code frame pointing at the offending line.
 */
export default function MdxErrorNotice({
  detail,
  showDetails = false,
  kind = "compile",
}: {
  detail?: Partial<MdxErrorDetail> | null;
  /** Show the technical cause — editors only. */
  showDetails?: boolean;
  /**
   * Which stage failed. A `"render"` failure happened after the document
   * compiled, so it carries no source position and the editor's Preview cannot
   * reproduce it — that pipeline emits HTML, not React. Worth saying out loud,
   * because otherwise "Check MDX says OK" reads as a contradiction.
   */
  kind?: "compile" | "render";
}) {
  const hasDetail = showDetails && detail?.reason;

  return (
    <div className="themed-surface border themed-border rounded-lg px-4 py-3 text-sm">
      <p className="mb-1 ps-mono-micro" style={{ color: "var(--color-error)" }}>
        Display error
      </p>
      <p className="themed-secondary">
        This content couldn&rsquo;t be displayed — its source contains a formatting error. The rest
        of the page still works.
      </p>
      {hasDetail && (
        <details className="mt-2">
          <summary className="text-xs themed-muted cursor-pointer themed-hover-foreground">
            Technical details (visible to editors only)
          </summary>
          <p className="mt-2 text-xs themed-secondary font-mono">
            {detail!.reason}
            {typeof detail!.line === "number" && (
              <>
                {" "}
                <span className="themed-muted">
                  (line {detail!.line}
                  {typeof detail!.column === "number" ? `, column ${detail!.column}` : ""})
                </span>
              </>
            )}
          </p>
          {detail!.frame && (
            <pre className="mt-2 text-xs themed-muted whitespace-pre font-mono overflow-x-auto">
              {detail!.frame}
            </pre>
          )}
          {kind === "render" && (
            <p className="mt-2 text-xs themed-muted">
              This failed while rendering, after the document compiled — so there
              is no source position, and the editor&rsquo;s Preview and
              &ldquo;Check MDX&rdquo; will both report success. Those render the
              document to HTML; this page renders it to React, which is stricter
              about component props.
            </p>
          )}
        </details>
      )}
    </div>
  );
}
