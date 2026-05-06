import { db } from "@/db"
import { savedAnimations } from "@/db/schema"
import { ilike, or, count } from "drizzle-orm"
import Link from "next/link"
import { getSession } from "@/lib/auth"
import Pagination from "@/components/Pagination"
import AnimationCard from "@/components/AnimationCard"

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
          <h1 className="text-4xl font-bold tracking-tight themed-heading">
            Animations
          </h1>
          {session?.isAdmin && (
            <Link
              href="/admin/animations/new"
              className="text-sm themed-muted hover:themed-secondary transition-colors underline underline-offset-2"
            >
              New animation →
            </Link>
          )}
        </div>
        <p className="themed-muted text-sm">
          {total} {total === 1 ? "animation" : "animations"} — embed in articles with{" "}
          <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
            {'<DynamicAnimation slug="your-slug" />'}
          </code>
        </p>
      </header>

      <form method="GET" action="/animations" className="mb-8">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search animations..."
          className="themed-input text-sm"
        />
      </form>

      <hr className="themed-border border-b mb-8" />

      {animations.length === 0 ? (
        <div className="text-center py-16">
          <p className="themed-muted text-sm mb-4">
            {query ? `No animations matching "${query}"` : "No animations yet."}
          </p>
          {session?.isAdmin && !query && (
            <Link
              href="/admin/animations/new"
              className="text-sm themed-muted hover:themed-secondary transition-colors underline underline-offset-2"
            >
              Create the first one →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {animations.map((anim) => (
            <AnimationCard
              key={anim.id}
              slug={anim.slug}
              name={anim.name}
              isAdmin={!!session?.isAdmin}
            />
          ))}
        </div>
      )}

      <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/animations" query={query} />
    </main>
  )
}
