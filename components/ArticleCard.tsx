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
      <p className="text-base font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-black dark:group-hover:text-white transition-colors">
        {title}
      </p>
      {summary && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
          {summary}
        </p>
      )}
      {updatedAt && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
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
