import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/db"
import { userThemes } from "@/db/schema"
import { eq } from "drizzle-orm"
import { defaultLight, defaultDark } from "@/lib/theme"
import ThemeEditor from "./ThemeEditor"

export default async function ThemeSettingsPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const existing = await db
    .select()
    .from(userThemes)
    .where(eq(userThemes.userId, session.userId))
    .limit(1)

  const lightTokens = existing[0]?.lightTokens ?? defaultLight
  const darkTokens = existing[0]?.darkTokens ?? defaultDark

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">
          Theme
        </h1>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          Customize your light and dark mode colors. Changes apply immediately as a preview and save on click.
        </p>
      </header>

      <hr className="border-zinc-200 dark:border-zinc-800 mb-8" />

      <ThemeEditor initialLight={lightTokens} initialDark={darkTokens} />
    </main>
  )
}
