import { cookies } from "next/headers";

/**
 * Return the anonymous analytics session ID from the `aview_sid` cookie.
 * The cookie is always minted by middleware before the page renders, so this
 * will be non-null on every request that goes through the middleware matcher.
 */
export async function getOrCreateSessionId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("aview_sid")?.value ?? null;
}
