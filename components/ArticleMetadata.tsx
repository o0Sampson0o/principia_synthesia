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
}

/**
 * Renders the frontmatter-derived metadata block below the article header.
 * Shows the status badge (when non-published), description, tags, and categories.
 * Returns null when all sections are empty.
 */
export default function ArticleMetadataDisplay({
  metadata,
  categories = [],
  publisherSlug,
}: ArticleMetadataDisplayProps) {
  const showDescription = metadata.description.trim().length > 0;
  const showTags = metadata.tags.length > 0;
  const showStatus = metadata.status !== "published";
  const showCategories = categories.length > 0;

  if (!showDescription && !showTags && !showStatus && !showCategories) return null;

  return (
    <div className="mt-4 space-y-3">
      {showStatus && (
        <span className="inline-block text-xs px-2 py-0.5 rounded uppercase tracking-wider bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          {metadata.status}
        </span>
      )}
      {showDescription && (
        <p className="text-sm themed-muted">{metadata.description}</p>
      )}
      {showTags && (
        <div className="flex flex-wrap gap-2">
          {metadata.tags.map((tag) => (
            <Link
              key={tag}
              href={`/search?tags=${encodeURIComponent(tag)}`}
              className="text-xs px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 themed-muted hover:border-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
      {showCategories && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/category/${cat.slug}`}
              className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 themed-muted hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              {cat.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
