import Link from "next/link";
import type { ArticleMetadata } from "@/lib/validations";

/**
 * Renders the frontmatter-derived metadata block below the article header.
 * Shows the status badge (when non-published), description, and clickable tags.
 * Returns null when all three sections are empty so it leaves no DOM footprint.
 */
export default function ArticleMetadataDisplay({ metadata }: { metadata: ArticleMetadata }) {
  const showDescription = metadata.description.trim().length > 0;
  const showTags = metadata.tags.length > 0;
  const showStatus = metadata.status !== "published";

  if (!showDescription && !showTags && !showStatus) return null;

  return (
    <div className="mt-4 space-y-3">
      {showStatus && (
        <span className="inline-block text-xs px-2 py-0.5 rounded uppercase tracking-wider bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          {metadata.status}
        </span>
      )}
      {showDescription && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {metadata.description}
        </p>
      )}
      {showTags && (
        <div className="flex flex-wrap gap-2">
          {metadata.tags.map((tag) => (
            <Link
              key={tag}
              href={`/search?tags=${encodeURIComponent(tag)}`}
              className="text-xs px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
