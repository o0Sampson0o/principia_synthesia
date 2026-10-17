import Link from "next/link";

export interface Crumb {
  label: string;
  /** Omit for the current page (rendered as plain text). */
  href?: string;
}

/**
 * The breadcrumb trail used across book pages (`@publisher / Book / Part /
 * Chapter / …`). Always ONE line: every crumb truncates rather than wrapping
 * (long chapter titles once made it four lines tall on a phone), and on
 * narrow screens only the last two crumbs show. All crumbs share one quiet
 * voice; a crumb without an `href` is the current page.
 */
export default function BookBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="ps-crumbs">
        {crumbs.map((c, i) => {
          return (
            <li key={i} className="ps-crumb" data-hide-narrow={i < crumbs.length - 2 || undefined}>
              {c.href ? (
                <Link
                  href={c.href}
                  className="ps-crumb-link"
                  title={c.label}
                >
                  {c.label}
                </Link>
              ) : (
                <span className="ps-crumb-current" aria-current="page" title={c.label}>
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
