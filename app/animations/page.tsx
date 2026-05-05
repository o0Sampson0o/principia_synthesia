import { db } from "@/db"
import { savedAnimations } from "@/db/schema"
import { ilike, or, count } from "drizzle-orm"
import Link from "next/link"
import { getSession } from "@/lib/auth"
import Pagination from "@/components/Pagination"

const PAGE_SIZE = 12

export default async function AnimationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q, page } = await searchParams
  const query = q?.trim() || ""
  const currentPage = Math.max(1, parseInt(page || "1", 10))
  const offset = (currentPage - 1) * PAGE_SIZE

  const session = await getSession()

  const where = query
    ? or(
        ilike(savedAnimations.name, `%${query}%`),
        ilike(savedAnimations.slug, `%${query}%`)
      )
    : undefined

  const [animations, [{ total }]] = await Promise.all([
    db
      .select()
      .from(savedAnimations)
      .where(where)
      .orderBy(savedAnimations.createdAt)
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(savedAnimations).where(where),
  ])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-8">
        <div className="flex items-baseline justify-between mb-2">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Animations
          </h1>
          {session?.isAdmin && (
            <Link
              href="/admin/animations/new"
              className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors underline underline-offset-2"
            >
              New animation →
            </Link>
          )}
        </div>
        <p className="text-zinc-500 dark:text-zinc-400">
          {total} {total === 1 ? "animation" : "animations"} — embed in articles with{" "}
          <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
            {"<DynamicAnimation slug=\"your-slug\" />"}
          </code>
        </p>
      </header>

      {/* Search */}
      <form method="GET" action="/animations" className="mb-8">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search animations..."
          className="w-full border border-zinc-200 dark:border-zinc-700 rounded px-4 py-2 text-sm bg-transparent text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors"
        />
      </form>

      <hr className="border-zinc-200 dark:border-zinc-800 mb-8" />

      {animations.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-400 dark:text-zinc-500 text-sm mb-4">
            {query ? `No animations matching "${query}"` : "No animations yet."}
          </p>
          {session?.isAdmin && !query && (
            <Link
              href="/admin/animations/new"
              className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors underline underline-offset-2"
            >
              Create the first one →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {animations.map((anim) => (
            <div
              key={anim.id}
              className="group block border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
            >
              {/* Preview iframe — clicking goes to animation page */}
              <Link href={`/animations/${anim.slug}`} className="block">
                <div className="relative bg-zinc-50 dark:bg-zinc-900" style={{ height: "200px", minHeight: "200px" }}>
                  <iframe
                    src={`/api/animations/${anim.slug}`}
                    className="w-full h-full border-0 pointer-events-none"
                    title={anim.name}
                    loading="lazy"
                  />
                </div>
              </Link>

              {/* Card footer */}
              <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <Link href={`/animations/${anim.slug}`} className="block flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:text-black dark:hover:text-white transition-colors">
                    {anim.name}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono mt-0.5">
                    {anim.slug}
                  </p>
                </Link>
                {session?.isAdmin && (
                  <Link
                    href={`/admin/animations/${anim.slug}`}
                    className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors ml-4 shrink-0"
                  >
                    Edit
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/animations" query={query} />
    </main>
  )
}
