import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

/**
 * Edge middleware that guards all `/admin/**` routes.
 *
 * Auth flow for requests matching `/admin/:path*`:
 * 1. If no `session` cookie is present → redirect to `/login`.
 * 2. If the cookie contains an invalid or expired JWT → redirect to `/login`.
 * 3. If the JWT payload has `isAdmin !== true` → redirect to `/` (homepage).
 * 4. Otherwise → allow the request through.
 *
 * Non-admin paths are passed through unconditionally. The same JWT secret and
 * algorithm (HS256) used by `lib/auth.ts` are replicated here so that the
 * middleware can verify tokens without importing server-only modules.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const session = payload as { isAdmin?: boolean };

    if (!session.isAdmin) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: "/admin/:path*",
};
