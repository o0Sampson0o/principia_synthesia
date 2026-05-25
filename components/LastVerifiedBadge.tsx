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
        <div className="mt-4 themed-surface border-l-4 border-amber-400 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          This article has not been verified by its author in over{" "}
          {staleMonths} months. Information may be out of date.
        </div>
      )}
    </>
  );
}
