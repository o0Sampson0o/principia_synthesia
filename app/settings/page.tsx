import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

const SECTIONS = [
  {
    href: "/settings/theme",
    title: "Theme",
    description: "Customize your light and dark color palettes. Changes preview live.",
  },
  {
    href: "/settings/api-tokens",
    title: "API tokens",
    description: "Personal access tokens for the sync API (ps-sync) — edit articles locally in any markdown editor.",
  },
  {
    href: "/settings/onboarding",
    title: "Onboarding",
    description: "Replay the product tour shown to new accounts.",
  },
] as const;

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="flex-1">

      {/* ── Framed masthead ─────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-2xl mx-auto px-5 py-8 sm:py-11">
          <p className="ps-eyebrow mb-3">Account</p>
          <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
            Settings
          </h1>
          <p className="themed-muted mt-2" style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
            Signed in as {session.email} ·{" "}
            <Link href={`/${session.userSlug}`} className="themed-link">
              @{session.userSlug}
            </Link>
          </p>
        </div>
      </div>

      {/* ── Section directory ───────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-5 py-10 sm:py-12">
        <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-1">
          <p className="ps-eyebrow-muted">Preferences</p>
        </div>

        <ul>
          {SECTIONS.map((s) => (
            <li key={s.href} className="border-b themed-border last:border-b-0">
              <Link
                href={s.href}
                className="group flex items-center gap-4 py-5 transition-colors hover:bg-[var(--surface)] -mx-3 px-3 rounded-lg"
              >
                <span className="min-w-0 flex-1">
                  <span className="themed-heading block" style={{ fontSize: "1rem", fontWeight: 600 }}>
                    {s.title}
                  </span>
                  <span className="themed-muted block mt-1" style={{ fontSize: "0.8125rem", lineHeight: 1.55 }}>
                    {s.description}
                  </span>
                </span>
                <svg
                  className="w-4 h-4 shrink-0 themed-muted transition-transform group-hover:translate-x-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>

        <p className="themed-muted mt-8" style={{ fontSize: "0.75rem" }}>
          Tip: press <kbd className="border themed-border rounded px-1 py-0.5 font-mono">Ctrl</kbd>{" "}
          <kbd className="border themed-border rounded px-1 py-0.5 font-mono">Shift</kbd>{" "}
          <kbd className="border themed-border rounded px-1 py-0.5 font-mono">P</kbd> anywhere to jump
          to any page or search all content.
        </p>
      </div>

    </main>
  );
}
