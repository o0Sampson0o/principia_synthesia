import Link from "next/link"
import { getSession } from "@/lib/auth"

export default async function NotFound() {
  const session = await getSession()

  return (
    <main className="max-w-3xl mx-auto px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
        404
      </h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        This article doesn't exist yet.
      </p>
      <div className="flex items-center justify-center gap-6">
        <Link
          href="/"
          className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors underline underline-offset-2"
        >
          ← Back to home
        </Link>
        {session?.isAdmin && (
          <Link
            href="/admin/articles/new"
            className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors underline underline-offset-2"
          >
            Create this article →
          </Link>
        )}
      </div>
    </main>
  )
}
