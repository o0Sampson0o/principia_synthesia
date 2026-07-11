import Link from "next/link";
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
    <main className="flex-1">

      {/* ── Framed masthead ─────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-2xl mx-auto px-5 py-8 sm:py-11">
          <p className="ps-eyebrow mb-3">
            <Link href="/settings" className="hover:opacity-70 transition-opacity">Settings</Link>
          </p>
          <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
            Theme
          </h1>
          <p className="themed-muted mt-2" style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
            Customize your color palette. Changes preview live.
          </p>
        </div>
      </div>

      {/* ── Editor ──────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-5 py-10 sm:py-12">
        <ThemeEditor initialLight={lightTokens} initialDark={darkTokens} />
      </div>

    </main>
  );
}
