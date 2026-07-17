import Link from "next/link";
import SectionHeader from "./SectionHeader";

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

/** How many forks show before the rest collapse behind a disclosure. */
const VISIBLE_FORKS = 10;

function ForkItem({ fork }: { fork: Fork }) {
  return (
    <li className="text-sm">
      <Link
        href={`/${fork.publisherSlug}/articles/${fork.slug}`}
        className="themed-link hover:underline"
      >
        {fork.title}
      </Link>
      <span className="themed-muted ml-1">by {fork.authorDisplayName}</span>
    </li>
  );
}

/**
 * Lists forks of the current article. The first ten render inline; the rest
 * sit behind a native <details> disclosure so no fork is ever unreachable.
 */
export default function ForksList({ forks, totalCount }: Props) {
  if (totalCount === 0) return null;

  const visible = forks.slice(0, VISIBLE_FORKS);
  const overflow = forks.slice(VISIBLE_FORKS);

  return (
    <section className="mt-16">
      <SectionHeader
        title="Forks"
        count={`${totalCount} ${totalCount === 1 ? "fork" : "forks"}`}
      />
      <ul className="space-y-2 mt-4">
        {visible.map((fork) => (
          <ForkItem key={fork.id} fork={fork} />
        ))}
      </ul>
      {overflow.length > 0 && (
        <details className="mt-2">
          <summary className="text-sm themed-muted cursor-pointer themed-hover-foreground transition-colors">
            Show {overflow.length} more {overflow.length === 1 ? "fork" : "forks"}
          </summary>
          <ul className="space-y-2 mt-2">
            {overflow.map((fork) => (
              <ForkItem key={fork.id} fork={fork} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
