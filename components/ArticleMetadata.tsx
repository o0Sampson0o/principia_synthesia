import Link from "next/link";
import type { ArticleMetadata } from "@/lib/validations";

interface Category {
  id: number;
  name: string;
  slug: string;
}

interface ArticleMetadataDisplayProps {
  metadata: ArticleMetadata;
  categories?: Category[];
  publisherSlug?: string;
  /** The header summary, when one rendered — a duplicate description is suppressed. */
  renderedSummary?: string | null;
}

/**
 * Renders the frontmatter-derived metadata block below the article header.
 * Shows the status badge (when non-published), description, tags, and categories.
 * Returns null when all sections are empty.
 */
export default function ArticleMetadataDisplay({
  metadata,
  categories = [],
  renderedSummary = null,
}: ArticleMetadataDisplayProps) {
  const showDescription =
    metadata.description.trim().length > 0 &&
    metadata.description.trim() !== renderedSummary?.trim();
  const showStatus = metadata.status !== "published";
  const showTags = categories.length > 0;

  if (!showDescription && !showStatus && !showTags) return null;

  return (
    <div className="mt-4 space-y-3">
      {showStatus && (
        <span className="themed-muted ps-mono-micro ps-status-pill">{metadata.status}</span>
      )}
      {showDescription && (
        <p className="text-sm themed-muted">{metadata.description}</p>
      )}
      {showTags && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/search?tags=${encodeURIComponent(cat.slug)}`}
              className="themed-tag text-xs"
            >
              #{cat.slug}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
