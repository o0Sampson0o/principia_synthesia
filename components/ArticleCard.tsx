import Link from "next/link"

interface Props {
  publisherSlug: string
  slug: string
  title: string
  summary?: string | null
  updatedAt?: Date | null
  tags?: string[]
}

export default function ArticleCard({ publisherSlug, slug, title, summary, updatedAt, tags }: Props) {
  return (
    <div className="py-4 border-b themed-border last:border-b-0">
      <Link
        href={`/${publisherSlug}/articles/${slug}`}
        className="article-title-serif block mb-1.5"
        style={{ fontSize: "1.0625rem" }}
      >
        {title}
      </Link>

      {summary && (
        <p className="themed-muted line-clamp-2 mb-2" style={{ fontSize: "0.8125rem", lineHeight: "1.65" }}>
          {summary}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="themed-muted" style={{ fontSize: "0.75rem" }}>@{publisherSlug}</span>
        {updatedAt && (
          <>
            <span className="themed-muted" style={{ fontSize: "0.75rem" }}>·</span>
            <span className="themed-muted" style={{ fontSize: "0.75rem" }}>
              {updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </>
        )}
        {tags && tags.length > 0 && (
          <div className="flex gap-1.5 ml-auto flex-wrap">
            {tags.slice(0, 3).map(tag => (
              <Link
                key={tag}
                href={`/search?tags=${encodeURIComponent(tag)}`}
                className="themed-tag"
                style={{ fontSize: "0.6875rem" }}
                onClick={e => e.stopPropagation()}
              >
                {tag}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
