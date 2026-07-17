import Link from "next/link";

type Props = {
  publisherSlug: string;
  slug: string;
  shortHash: string;
  publishedAt: Date;
};

export default function SnapshotBanner({
  publisherSlug,
  slug,
  shortHash,
  publishedAt,
}: Props) {
  const formatted = new Date(publishedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="mb-6 themed-surface border themed-border rounded-lg px-4 py-3 text-sm">
      <p
        className="themed-muted mb-1"
        style={{
          fontSize: "0.5625rem",
          fontFamily: "ui-monospace, monospace",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Archived version
      </p>
      <p className="themed-heading font-medium">
        You are viewing version{" "}
        <code className="themed-inline-code">
          {shortHash}
        </code>{" "}
        — published {formatted}.
      </p>
      <Link
        href={`/${publisherSlug}/articles/${slug}`}
        className="themed-link underline underline-offset-2 text-xs mt-1 inline-block"
      >
        View latest version →
      </Link>
    </div>
  );
}
