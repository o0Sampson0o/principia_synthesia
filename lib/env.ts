function readAuthSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    // Dev/test fallback — only in non-production.
    return new TextEncoder().encode("dev-secret-change-in-production");
  }
  return new TextEncoder().encode(raw);
}

/** Module-singleton: evaluated once per process. */
export const JWT_SECRET: Uint8Array = readAuthSecret();
