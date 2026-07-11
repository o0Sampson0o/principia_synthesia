import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { apiTokens, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { SessionPayload } from "@/lib/auth";

/**
 * Bearer-token auth for the sync REST API (/api/v1).
 *
 * Tokens are personal access tokens created in Settings → API tokens. Only
 * their sha256 hash is stored (same pattern as email-verification tokens in
 * lib/auth.ts). A resolved token yields the exact SessionPayload shape used by
 * cookie sessions, so downstream checks (canEditContent, canManageOrg) work
 * unchanged.
 *
 * Deliberately no cookie fallback: /api/v1 accepts only Bearer tokens, which
 * makes CSRF a non-issue for these routes.
 */

export const API_TOKEN_PREFIX = "pst_";

/** Length of the raw-token prefix stored for display in the settings UI. */
const DISPLAY_PREFIX_LENGTH = 12;

/** How stale lastUsedAt may get before we bother writing an update. */
const LAST_USED_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export function hashApiToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generates a new raw API token plus the hash to store and the display prefix.
 * The raw token must be shown to the user exactly once and never persisted.
 */
export function generateApiToken(): { raw: string; hash: string; prefix: string } {
  const raw = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { raw, hash: hashApiToken(raw), prefix: raw.slice(0, DISPLAY_PREFIX_LENGTH) };
}

/**
 * Resolves the Authorization header of a request to a SessionPayload.
 * Returns null when the header is missing/malformed, the token is unknown,
 * revoked, or expired.
 */
export async function getApiSession(request: Request): Promise<SessionPayload | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const raw = header.slice("Bearer ".length).trim();
  if (!raw.startsWith(API_TOKEN_PREFIX)) return null;

  const tokenHash = hashApiToken(raw);
  const [row] = await db
    .select({
      tokenId: apiTokens.id,
      expiresAt: apiTokens.expiresAt,
      lastUsedAt: apiTokens.lastUsedAt,
      userId: users.id,
      email: users.email,
      publisherSlug: users.publisherSlug,
      isRootAdmin: users.isRootAdmin,
    })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  // Throttled usage tracking: fire-and-forget, at most one write per interval.
  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_UPDATE_INTERVAL_MS) {
    db.update(apiTokens)
      .set({ lastUsedAt: new Date(now) })
      .where(eq(apiTokens.id, row.tokenId))
      .catch(() => {});
  }

  return {
    userId: row.userId,
    email: row.email,
    userSlug: row.publisherSlug,
    isRootAdmin: row.isRootAdmin,
  };
}

/**
 * Route-handler guard: returns the session, or a ready-to-return 401 response.
 *
 * Usage:
 *   const auth = await requireApiSession(request);
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireApiSession(
  request: Request
): Promise<SessionPayload | NextResponse> {
  const session = await getApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return session;
}
