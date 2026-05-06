"use server"

import { db } from "@/db"
import { userThemes } from "@/db/schema"
import { eq } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { defaultLight, defaultDark } from "@/lib/theme"
import type { ThemeTokens } from "@/db/schema"

export async function saveTheme(formData: FormData) {
  const session = await getSession()
  if (!session?.userId) throw new Error("Not authenticated")

  const mode = formData.get("mode") as "light" | "dark"

  const tokens: ThemeTokens = {
    background:      formData.get("background") as string,
    foreground:      formData.get("foreground") as string,
    muted:           formData.get("muted") as string,
    mutedForeground: formData.get("mutedForeground") as string,
    border:          formData.get("border") as string,
    link:            formData.get("link") as string,
    linkHover:       formData.get("linkHover") as string,
    codeBackground:  formData.get("codeBackground") as string,
  }

  const existing = await db
    .select()
    .from(userThemes)
    .where(eq(userThemes.userId, session.userId))
    .limit(1)

  if (existing[0]) {
    await db
      .update(userThemes)
      .set({
        ...(mode === "light" ? { lightTokens: tokens } : { darkTokens: tokens }),
        updatedAt: new Date(),
      })
      .where(eq(userThemes.userId, session.userId))
  } else {
    await db.insert(userThemes).values({
      userId: session.userId,
      lightTokens: mode === "light" ? tokens : defaultLight,
      darkTokens: mode === "dark" ? tokens : defaultDark,
    })
  }

  revalidatePath("/", "layout")
}

export async function resetTheme(formData: FormData) {
  const session = await getSession()
  if (!session?.userId) throw new Error("Not authenticated")

  const mode = formData.get("mode") as "light" | "dark"

  const existing = await db
    .select()
    .from(userThemes)
    .where(eq(userThemes.userId, session.userId))
    .limit(1)

  if (existing[0]) {
    await db
      .update(userThemes)
      .set({
        ...(mode === "light" ? { lightTokens: defaultLight } : { darkTokens: defaultDark }),
        updatedAt: new Date(),
      })
      .where(eq(userThemes.userId, session.userId))
  }

  revalidatePath("/", "layout")
}
