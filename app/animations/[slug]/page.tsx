import { db } from "@/db"
import { savedAnimations } from "@/db/schema"
import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import Link from "next/link"
import AnimationPreview from "@/components/AnimationPreview"

export default async function AnimationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const anim = await db
    .select()
    .from(savedAnimations)
    .where(eq(savedAnimations.slug, slug))
    .limit(1)

  if (!anim[0]) notFound()

  const { name, createdAt } = anim[0]

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
