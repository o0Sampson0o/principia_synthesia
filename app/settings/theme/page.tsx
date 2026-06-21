import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { userThemes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { defaultLight, defaultDark } from "@/lib/theme";
import ThemeEditor from "./ThemeEditor";

export default async function ThemeSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const existing = await db
    .select()
    .from(userThemes)
    .where(eq(userThemes.userId, session.userId))
    .limit(1);

  const lightTokens = { ...defaultLight, ...existing[0]?.lightTokens };
  const darkTokens = { ...defaultDark, ...existing[0]?.darkTokens };

  return (
    <main className="max-w-2xl mx-auto px-5 py-12 sm:py-16">

      <div className="mb-10">
        <p className="ps-eyebrow mb-3">Settings</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
          Theme
        </h1>
        <p className="themed-muted mt-2" style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
          Customize your light and dark mode colors. Changes apply immediately as a preview and save on click.
        </p>
      </div>

      <hr className="themed-hr mb-10" />

      <ThemeEditor initialLight={lightTokens} initialDark={darkTokens} />

    </main>
  );
}
