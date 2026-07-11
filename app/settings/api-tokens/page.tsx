import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import TokenManager from "./TokenManager";

export default async function ApiTokensSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const tokens = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, session.userId))
    .orderBy(desc(apiTokens.createdAt));

  return (
    <main className="flex-1">

      {/* ── Framed masthead ─────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-2xl mx-auto px-5 py-8 sm:py-11">
          <p className="ps-eyebrow mb-3">
            <Link href="/settings" className="hover:opacity-70 transition-opacity">Settings</Link>
          </p>
          <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
            API tokens
          </h1>
          <p className="themed-muted mt-2" style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
            Personal access tokens for the sync API (ps-sync). A token grants the
            same content-editing rights as your account — treat it like a password.
          </p>
        </div>
      </div>

      {/* ── Manager ─────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-5 py-10 sm:py-12">
        <TokenManager
          tokens={tokens.map((t) => ({
            id: t.id,
            name: t.name,
            prefix: t.prefix,
            createdAt: t.createdAt.toISOString(),
            lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
            expiresAt: t.expiresAt?.toISOString() ?? null,
            revokedAt: t.revokedAt?.toISOString() ?? null,
          }))}
        />

        {/* ── Sync CLI quickstart ─────────────────────────────────────── */}
        <section className="mt-12">
          <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-4">
            <p className="ps-eyebrow-muted">Set up ps-sync</p>
            <a
              href="/ps-sync.mjs"
              download
              className="themed-link"
              style={{ fontSize: "0.75rem" }}
            >
              Download ps-sync.mjs
            </a>
          </div>
          <p className="themed-muted mb-4" style={{ fontSize: "0.8125rem", lineHeight: 1.6 }}>
            ps-sync mirrors your articles into a local folder as markdown files —
            editable with any editor (Obsidian, VS Code, ...) — and pushes your
            changes back. It is a single self-contained file; the only requirement
            is <a href="https://nodejs.org" className="themed-link">Node.js 18+</a>.
          </p>
          <pre
            className="rounded-lg border themed-border overflow-x-auto p-4"
            style={{
              fontSize: "0.75rem",
              lineHeight: 1.7,
              fontFamily: "ui-monospace, monospace",
              background: "var(--code-background, var(--surface))",
            }}
          >
            <code>{`# in the folder you want to sync into
curl -O https://www.principiasynthesia.org/ps-sync.mjs

node ps-sync.mjs init   # paste a token created above
node ps-sync.mjs pull   # download your articles
node ps-sync.mjs push   # upload local edits (conflicts are rejected, never merged)
node ps-sync.mjs help   # all commands and flags`}</code>
          </pre>
        </section>
      </div>

    </main>
  );
}
