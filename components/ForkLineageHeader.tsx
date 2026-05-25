import Link from "next/link";

interface Props {
  originalTitle: string;
  originalAuthorDisplayName: string;
  originalPublisherSlug: string;
  originalArticleSlug: string;
}

/**
 * Displayed above the article body when the article has a `forkedFromId`.
 * Not part of the editable MDX — enforced layout injected by the page.
 */
export default function ForkLineageHeader({
  originalTitle,
  originalAuthorDisplayName,
  originalPublisherSlug,
  originalArticleSlug,
}: Props) {
  return (
    <div className="themed-surface border-l-4 border-amber-500 pl-4 py-3 mb-6 rounded-r text-sm">
      <span className="opacity-70">Forked from </span>
      <Link
        href={`/${originalPublisherSlug}/articles/${originalArticleSlug}`}
        className="themed-link font-medium"
      >
        &ldquo;{originalTitle}&rdquo;
      </Link>
      <span className="opacity-70"> by {originalAuthorDisplayName}</span>
      <Link
        href={`/${originalPublisherSlug}/articles/${originalArticleSlug}`}
        className="themed-link ml-2 text-xs opacity-70 hover:opacity-100"
      >
        [link to original &rarr;]
      </Link>
    </div>
  );
}
