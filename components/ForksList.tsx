import Link from "next/link";

interface Fork {
  id: number;
  slug: string;
  title: string;
  publisherSlug: string;
  authorDisplayName: string;
}

interface Props {
  forks: Fork[];
  totalCount: number;
}

/**
 * Lists up to 10 forks of the current article.
 * Rendered by the article page as a server component.
 */
export default function ForksList({ forks, totalCount }: Props) {
  if (totalCount === 0) return null;

  const hiddenCount = totalCount - forks.length;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-3">
        {totalCount === 1 ? "1 fork" : `${totalCount} forks`}
      </h2>
      <ul className="space-y-2">
        {forks.map((fork) => (
          <li key={fork.id} className="text-sm">
            <Link
              href={`/${fork.publisherSlug}/articles/${fork.slug}`}
              className="themed-link hover:underline"
            >
              {fork.title}
            </Link>
            <span className="opacity-60 ml-1">by {fork.authorDisplayName}</span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <p className="text-sm opacity-60 mt-2">
          &hellip; and {hiddenCount} more {hiddenCount === 1 ? "fork" : "forks"}
        </p>
      )}
    </section>
  );
}
