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
    isDev || allowEval ? "'unsafe-eval'" : "",
  ]
    .filter(Boolean)
    .join(" ");

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
 * 1. Rate-limits `/login` and `/signup` routes.
 * 2. Redirects unauthenticated requests to `/settings/**` to `/login`.
 * 3. Attaches a per-request CSP nonce and enforces a Content-Security-Policy
 *    header on every response. The nonce is forwarded via `x-csp-nonce` so
 *    Server Components can stamp it onto inline `<script>` tags.
 *
 * The old `/admin/**` guard is removed — there are no admin routes any more.
 * `allowEval` is true for settings pages and publisher content editor pages
 * (article/object create and edit), which need MDX previewing.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";

  // Rate-limit login and signup attempts
  if (pathname === "/login" || pathname === "/signup") {
    const allowed = rateLimit(`auth:${ip}`, 10, 60_000);
    if (!allowed) {
      return new NextResponse("Too Many Requests", { status: 429 });
    }
  }

  // Thin auth gate for settings routes
  if (pathname.startsWith("/settings")) {
    const token = request.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    try {
      await jwtVerify(token, JWT_SECRET);
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");

  // Allow unsafe-eval on settings pages and publisher content editor routes.
  // Pattern matches: /<publisher>/articles/new, /<publisher>/articles/<slug>/edit,
  //                  /<publisher>/objects/new, /<publisher>/objects/<slug>/edit
  const allowEval =
    pathname.startsWith("/settings") ||
    /^\/[^/]+\/(?:articles|objects)\/(?:new|[^/]+\/edit)$/.test(pathname);

  const csp = buildCsp(nonce, allowEval);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|monitoring).*)"],
};
