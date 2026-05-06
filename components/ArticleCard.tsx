import Link from "next/link"

interface Props {
  slug: string
  title: string
  summary?: string | null
  updatedAt?: Date | null
}

export default function ArticleCard({ slug, title, summary, updatedAt }: Props) {
  return (
    <Link href={`/${slug}`} className="group block">
      <p className="text-base font-medium themed-heading group-hover:opacity-70 transition-opacity">
        {title}
      </p>
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
