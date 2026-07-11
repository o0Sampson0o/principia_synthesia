"use client";

import { useState, useTransition } from "react";
import { createApiToken, revokeApiToken } from "./actions";

interface TokenRow {
  id: number;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function TokenManager({ tokens }: { tokens: TokenRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Snapshot once per mount; expiry display doesn't need to tick live.
  const [now] = useState(() => Date.now());

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createApiToken(formData);
      if (result.ok) {
        setNewToken(result.raw);
        setCopied(false);
      } else {
        setError(result.error);
      }
    });
  }

  function handleRevoke(formData: FormData) {
    startTransition(async () => {
      await revokeApiToken(formData);
    });
  }

  async function copyToken() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
  }

  return (
    <div className="space-y-10">

      {/* ── Create ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-4">
          <p className="ps-eyebrow-muted">New token</p>
        </div>

        <form action={handleCreate} className="flex flex-col sm:flex-row gap-3">
          <input
            name="name"
            required
            maxLength={100}
            placeholder="Token name (e.g. laptop-sync)"
            className="themed-input rounded-lg flex-1"
            style={{ fontSize: "0.875rem", padding: "0.5rem 0.75rem" }}
          />
          <select
            name="expiresInDays"
            defaultValue="90"
            className="themed-input rounded-lg"
            style={{ fontSize: "0.875rem", padding: "0.5rem 0.75rem" }}
          >
            <option value="30">Expires in 30 days</option>
            <option value="90">Expires in 90 days</option>
            <option value="365">Expires in 1 year</option>
            <option value="">Never expires</option>
          </select>
          <button
            type="submit"
            disabled={isPending}
            className="themed-btn-primary rounded-lg"
            style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
          >
            {isPending ? "Creating…" : "Create token"}
          </button>
        </form>

        {error && (
          <p className="mt-3" style={{ fontSize: "0.8125rem", color: "var(--danger, #b91c1c)" }}>
            {error}
          </p>
        )}

        {newToken && (
          <div
            className="mt-4 rounded-lg border themed-border p-4"
            style={{ background: "var(--surface)" }}
          >
            <p className="themed-heading mb-2" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
              Copy your token now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 overflow-x-auto rounded px-2 py-1.5"
                style={{
                  fontSize: "0.75rem",
                  fontFamily: "ui-monospace, monospace",
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  whiteSpace: "nowrap",
                }}
              >
                {newToken}
              </code>
              <button
                type="button"
                onClick={copyToken}
                className="themed-btn-ghost rounded-lg shrink-0"
                style={{ fontSize: "0.75rem", padding: "0.375rem 0.75rem" }}
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Existing tokens ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-4">
          <p className="ps-eyebrow-muted">Your tokens</p>
          <span className="themed-muted" style={{ fontSize: "0.6875rem" }}>
            {tokens.filter((t) => !t.revokedAt).length} active
          </span>
        </div>

        {tokens.length === 0 ? (
          <p className="themed-muted" style={{ fontSize: "0.875rem" }}>
            No tokens yet. Create one above to use the sync API.
          </p>
        ) : (
          <ul className="space-y-3">
            {tokens.map((t) => {
              const expired = t.expiresAt && new Date(t.expiresAt).getTime() <= now;
              const inactive = !!t.revokedAt || !!expired;
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border themed-border p-3"
                  style={{ opacity: inactive ? 0.55 : 1 }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="themed-heading" style={{ fontSize: "0.875rem", lineHeight: 1.3 }}>
                      {t.name}
                      {t.revokedAt && (
                        <span className="themed-muted ml-2" style={{ fontSize: "0.6875rem" }}>revoked</span>
                      )}
                      {!t.revokedAt && expired && (
                        <span className="themed-muted ml-2" style={{ fontSize: "0.6875rem" }}>expired</span>
                      )}
                    </p>
                    <p className="themed-muted" style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}>
                      {t.prefix}… · created {formatDate(t.createdAt)}
                      {" · last used "}{formatDate(t.lastUsedAt)}
                      {t.expiresAt ? ` · expires ${formatDate(t.expiresAt)}` : " · never expires"}
                    </p>
                  </div>
                  {!t.revokedAt && (
                    <form action={handleRevoke}>
                      <input type="hidden" name="tokenId" value={t.id} />
                      <button
                        type="submit"
                        disabled={isPending}
                        className="themed-btn-ghost rounded-lg shrink-0"
                        style={{ fontSize: "0.75rem", padding: "0.375rem 0.75rem" }}
                      >
                        Revoke
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </div>
  );
}
