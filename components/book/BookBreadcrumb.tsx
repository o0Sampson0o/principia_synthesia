import Link from "next/link";

export interface Crumb {
  label: string;
  /** Omit for the current page (rendered as plain text). */
  href?: string;
}

/**
 * The hand-rolled eyebrow breadcrumb trail used across book pages:
 * `@publisher / Book / Part / Chapter / Section`. The first crumb uses the
 * `.ps-eyebrow` treatment; the rest are muted. A crumb without an `href` is the
 * current page.
 */
export default function BookBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      {crumbs.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && (
            <span className="themed-muted" style={{ fontSize: "0.625rem" }}>
              /
            </span>
          )}
          {c.href ? (
            <Link
              href={c.href}
              className={
                i === 0
                  ? "ps-eyebrow hover:opacity-70 transition-opacity"
                  : "themed-muted hover:text-[var(--foreground)] transition-colors truncate"
              }
              style={i === 0 ? undefined : { fontSize: "0.6875rem" }}
            >
              {c.label}
            </Link>
          ) : (
            <span className="themed-muted truncate" style={{ fontSize: "0.6875rem" }}>
              {c.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
