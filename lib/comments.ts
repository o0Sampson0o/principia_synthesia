import { createHash, randomBytes } from "crypto";
import { cookies, headers } from "next/headers";

// ---------------------------------------------------------------------------
// Guest identity
// ---------------------------------------------------------------------------

/**
 * Guests get a random token in an httpOnly cookie on their first comment; the
 * SHA-256 of it is stored on each of their comments. Matching hash = "this is
 * your comment" (see pending visibility and the guest edit/delete window).
 */
export const GUEST_COOKIE = "ps_guest";

/** How long after posting a guest can still edit/delete their comment. */
export const GUEST_EDIT_WINDOW_MS = 15 * 60_000;

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Returns the hash of the current visitor's guest token, minting a new token
 * (and setting the cookie) when `mint` is true and none exists. Server
 * components must call with `mint: false` — cookies can only be written from
 * actions/route handlers.
 */
export async function getGuestTokenHash(opts: { mint: boolean }): Promise<string | null> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (existing) return hashGuestToken(existing);
  if (!opts.mint) return null;

  const token = randomBytes(32).toString("base64url");
  store.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return hashGuestToken(token);
}

// ---------------------------------------------------------------------------
// IP hashing (rate limiting + moderation; the raw IP is never stored)
// ---------------------------------------------------------------------------

export async function getClientIpHash(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const salt = process.env.COMMENT_IP_SALT || process.env.AUTH_SECRET || "dev-salt";
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

// ---------------------------------------------------------------------------
// Cloudflare Turnstile
// ---------------------------------------------------------------------------

/**
 * Server-side verification of a Turnstile response token. When
 * TURNSTILE_SECRET_KEY is unset (local dev, tests), verification is skipped
 * and every submission passes — set the key in production.
 */
export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
