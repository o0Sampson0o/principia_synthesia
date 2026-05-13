import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { rateLimit } from "@/lib/rate-limit";

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function buildCsp(nonce: string, allowEval: boolean = false): string {
  const isDev = process.env.NODE_ENV === "development";
  const scriptSrc = [
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    (isDev || allowEval) ? "'unsafe-eval'" : "",
  ].filter(Boolean).join(" ");

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self' https://vitals.vercel-insights.com https://vercel.live`,
    `frame-src 'self' https://vercel.live`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join("; ");
}

/**
 * Middleware that:
 * 1. Attaches a per-request CSP nonce and enforces a Content-Security-Policy
 *    header on every response. The nonce is forwarded via `x-csp-nonce` so
 *    Server Components can stamp it onto inline `<script>` tags.
 * 2. Guards all `/admin/**` routes — redirects to `/login` if no valid admin
 *    session JWT is present.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";

  // Rate-limit login attempts
  if (pathname === "/login") {
    const allowed = rateLimit(`login:${ip}`, 10, 60_000);
    if (!allowed) {
      return new NextResponse("Too Many Requests", { status: 429 });
    }
  }

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  
  // Allow unsafe-eval on routes that need MDX previewing or other evaluation
  const allowEval = pathname.startsWith("/admin") || pathname.startsWith("/settings");
  
  const csp = buildCsp(nonce, allowEval);

  // Admin auth check
  if (pathname.startsWith("/admin")) {
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
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|monitoring).*)"],
};
