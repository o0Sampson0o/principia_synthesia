import Link from "next/link"

interface Props {
  currentPage: number
  totalPages: number
  basePath: string   // e.g. "/animations" or "/admin"
  query?: string     // optional search query to preserve
}

export default function Pagination({ currentPage, totalPages, basePath, query }: Props) {
  if (totalPages <= 1) return null

  const qs = (page: number) => {
    const params = new URLSearchParams()
    if (query) params.set("q", query)
    params.set("page", String(page))
    return `${basePath}?${params.toString()}`
  }

  return (
    <nav className="flex items-center justify-center gap-2 mt-10">
      {currentPage > 1 && (
        <Link
          href={qs(currentPage - 1)}
          className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          ← Previous
        </Link>
      )}
      <span className="text-sm text-zinc-400 dark:text-zinc-500 px-4">
        Page {currentPage} of {totalPages}
      </span>
      {currentPage < totalPages && (
        <Link
          href={qs(currentPage + 1)}
          className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          Next →
        </Link>
      )}
    </nav>
  )
}
