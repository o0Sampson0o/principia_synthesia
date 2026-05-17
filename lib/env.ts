let _secret: Uint8Array | null = null;

/**
 * Returns the JWT signing secret. Lazy — evaluated on first call so the
 * module can be imported during `next build` without AUTH_SECRET being set.
 * Throws at request time in production if the var is missing or too short.
 */
export function getJwtSecret(): Uint8Array {
  if (_secret) return _secret;
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return new TextEncoder().encode("dev-secret-change-in-production");
  }
  _secret = new TextEncoder().encode(raw);
  return _secret;
}
