type Props = {
  lastVerifiedAt: Date | null;
  isPublished: boolean;
  isStale: boolean;
  staleMonths: number;
};

export default function LastVerifiedBadge({
  lastVerifiedAt,
  isPublished,
  isStale,
  staleMonths,
}: Props) {
  if (!isPublished || !lastVerifiedAt) return null;

  const formatted = new Date(lastVerifiedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      <span className="text-xs themed-muted">Last verified: {formatted}</span>
      {isStale && (
        <div className="mt-4 themed-surface border themed-border rounded-lg px-4 py-3 text-sm">
          <p
            className="themed-muted mb-1"
            style={{
              fontSize: "0.5625rem",
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Unverified
          </p>
          <p className="themed-secondary">
            This article has not been verified by its author in over {staleMonths} months.
            Information may be out of date.
          </p>
        </div>
      )}
    </>
  );
}
