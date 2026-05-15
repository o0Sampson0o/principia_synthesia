import { db } from "@/db"
import { objects } from "@/db/schema"
import { and, eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import Link from "next/link"
import AnimationPreview from "@/components/AnimationPreview"

export default async function AnimationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const rows = await db
    .select()
    .from(objects)
    .where(and(eq(objects.slug, slug), eq(objects.type, "animation")))
    .limit(1)

  if (!rows[0]) notFound()

  const { name, createdAt } = rows[0]

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <Link
        href="/animations"
        className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mb-6 inline-block"
      >
        ← All animations
      </Link>

      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">
          {name}
        </h1>
        {createdAt && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Created{" "}
            {createdAt.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
      </header>

      <hr className="border-zinc-200 dark:border-zinc-800 mb-8" />

      <AnimationPreview slug={slug} />
    </main>
  )
}
