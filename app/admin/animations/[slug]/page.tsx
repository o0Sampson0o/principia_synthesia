import { db } from "@/db"
import { objects } from "@/db/schema"
import { and, eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import AnimationEditor from "../AnimationEditor"

export default async function EditAnimationPage({
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

  const code = (rows[0].content as { code?: string }).code ?? ""

  return (
    <AnimationEditor
      initial={{ slug: rows[0].slug, name: rows[0].name, code }}
    />
  )
}
