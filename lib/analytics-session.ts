import { cookies } from "next/headers";
import { randomBytes } from "crypto";

const COOKIE_NAME = "aview_sid";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Return the existing anonymous session ID from the `aview_sid` cookie, or
 * mint a fresh 32-hex-char ID and set the cookie before returning it.
 *
 * The cookie is httpOnly, sameSite=lax, and secure in production so it cannot
 * be read by client JavaScript and is not sent cross-site.
 */
export async function getOrCreateSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME);
  if (existing?.value) return existing.value;

  const sessionId = randomBytes(16).toString("hex");
  jar.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
  return sessionId;
}
