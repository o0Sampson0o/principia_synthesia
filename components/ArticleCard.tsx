import Link from "next/link"

interface Props {
  publisherSlug: string
  slug: string
  title: string
  summary?: string | null
  updatedAt?: Date | null
}

export default function ArticleCard({ publisherSlug, slug, title, summary, updatedAt }: Props) {
  return (
    <Link href={`/${publisherSlug}/articles/${slug}`} className="group block">
      <p className="text-base font-medium themed-heading group-hover:opacity-70 transition-opacity">
        {title}
      </p>
      <p className="text-xs themed-muted mt-0.5">@{publisherSlug}</p>
      {summary && (
        <p className="text-sm themed-muted mt-0.5 line-clamp-2">
          {summary}
        </p>
      )}
      {updatedAt && (
        <p className="text-xs themed-muted mt-1">
          {updatedAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      )}
    </Link>
  )
}
