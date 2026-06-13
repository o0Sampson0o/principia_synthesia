import Link from "next/link";

interface Props {
  type: "article" | "book" | "object";
  publisherSlug: string;
  slug: string;
  title: string;
  description?: string | null;
  objectType?: string;
}

export default function SearchResultItem({ type, publisherSlug, slug, title, description, objectType }: Props) {
  let href = `/${publisherSlug}/articles/${slug}`;
  let icon = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
    </svg>
  );

  if (type === "book") {
    href = `/${publisherSlug}/books/${slug}`;
    icon = (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    );
  } else if (type === "object") {
    href = `/${publisherSlug}/objects/${slug}`;
    icon = (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 0 1 0 1.971l-11.54 6.347a1.125 1.125 0 0 1-1.667-.985V5.653z" />
      </svg>
    );
  }

  return (
    <Link href={href} className="group flex items-start gap-4 p-4 rounded-lg border themed-border hover:themed-surface-hover transition-colors">
      <div className="mt-1 themed-muted group-hover:themed-foreground transition-colors shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold themed-heading group-hover:themed-link transition-colors truncate">
          {title}
        </h3>
        <p className="text-xs themed-muted mt-0.5">
          @{publisherSlug} {objectType && <span className="capitalize">· {objectType}</span>}
        </p>
        {description && (
          <p className="text-sm themed-muted mt-1.5 line-clamp-2">
            {description}
          </p>
        )}
      </div>
    </Link>
  );
}
