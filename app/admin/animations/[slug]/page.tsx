import { db } from "@/db"
import { savedAnimations } from "@/db/schema"
import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import AnimationEditor from "../AnimationEditor"

export default async function EditAnimationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const anim = await db.select().from(savedAnimations).where(eq(savedAnimations.slug, slug)).limit(1)
  if (!anim[0]) notFound()

  return (
    <AnimationEditor
      initial={{ slug: anim[0].slug, name: anim[0].name, code: anim[0].code }}
    />
  )
}
