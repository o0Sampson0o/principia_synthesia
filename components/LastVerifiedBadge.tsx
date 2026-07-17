import { formatDate } from "@/lib/format-date";

type BadgeProps = {
  lastVerifiedAt: Date | null;
  isPublished: boolean;
};

/**
 * Inline "Last verified" fact for the article meta row. The page-level
 * staleness warning is the separate StaleWarningBanner below — the two were
 * split so a block panel never renders inside the flex meta row.
 */
export default function LastVerifiedBadge({ lastVerifiedAt, isPublished }: BadgeProps) {
  if (!isPublished || !lastVerifiedAt) return null;

  const formatted = formatDate(lastVerifiedAt);

  return <span className="themed-muted ps-mono-meta">verified {formatted}</span>;
}

/**
 * Page-level staleness notice, rendered as a block sibling of the article
 * header (never inside the meta row).
 */
export function StaleWarningBanner({ staleMonths }: { staleMonths: number }) {
  return (
    <div
      role="note"
      className="mb-6 themed-surface border themed-border rounded-lg px-4 py-3 text-sm"
    >
      <p className="themed-muted mb-1 ps-mono-micro">Unverified</p>
      <p className="themed-secondary">
        This article has not been verified by its author in over {staleMonths} months.
        Information may be out of date.
      </p>
    </div>
  );
}
