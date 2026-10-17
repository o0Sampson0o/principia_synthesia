import { formatDate } from "@/lib/format-date";

type BadgeProps = {
  lastVerifiedAt: Date | null;
  isPublished: boolean;
  /** Past the staleness window: say so in the same fact, not a separate box. */
  stale?: boolean;
  /** The staleness window, for the tooltip. */
  staleMonths?: number;
};

/**
 * Inline "verified" fact for the article meta row. A stale article says so
 * right here ("last verified …" in the warning ink, the reason in its tooltip) rather than in a block
 * panel under the header: the panel once sat beside "verified <date>" and read
 * as a contradiction, and it pushed the prose further down the page.
 */
export default function LastVerifiedBadge({ lastVerifiedAt, isPublished, stale = false, staleMonths }: BadgeProps) {
  if (!isPublished || !lastVerifiedAt) return null;

  const formatted = formatDate(lastVerifiedAt);
  if (!stale) return <span className="themed-muted ps-mono-meta">verified {formatted}</span>;

  return (
    <span
      className="ps-mono-meta ps-stale-fact"
      title={staleMonths ? `Not verified by its author in over ${staleMonths} months` : undefined}
    >
      last verified {formatted}
      <span className="sr-only"> — may be out of date</span>
    </span>
  );
}
