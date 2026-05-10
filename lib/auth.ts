import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);
const COOKIE_NAME = "session";
const BCRYPT_ROUNDS = 10;

/**
 * The decoded payload stored inside the session JWT.
 * Extends jose's JWTPayload so standard claims (iat, exp) are also available.
 */
export interface SessionPayload extends JWTPayload {
  userId: number;
  email: string;
  isAdmin: boolean;
}

/**
 * Hashes a plaintext password with bcrypt (10 rounds).
 * Store the returned hash in the database; never store the plaintext.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compares a plaintext password against a bcrypt hash.
 * Returns `true` if the password matches, `false` otherwise.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Signs a SessionPayload as an HS256 JWT with a 7-day expiry.
 * The secret is read from the `AUTH_SECRET` environment variable.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

/**
 * Verifies a JWT string and returns its payload, or `null` if the token is
 * missing, expired, or signed with a different secret.
 */
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Reads the `session` httpOnly cookie and verifies it.
 * Returns the decoded SessionPayload, or `null` if the user is not logged in
 * or the token has expired. Call this in Server Components to get the current user.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Creates a session JWT from `session` and writes it to the `session`
 * httpOnly cookie (7-day maxAge, SameSite=lax, Secure in production).
 * Call this after successful login.
 */
export async function setSessionCookie(session: SessionPayload): Promise<void> {
  const token = await createSessionToken(session);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

/**
 * Clears the `session` cookie by overwriting it with an empty value and
 * maxAge=0, effectively logging the user out. Call this from the logout handler.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
