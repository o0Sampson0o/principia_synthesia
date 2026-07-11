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
          <p className="ps-eyebrow mb-3">Settings</p>
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
      </div>

    </main>
  );
}
