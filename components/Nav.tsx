import Link from "next/link";
import { getSession } from "@/lib/auth";

export default async function Nav() {
  const session = await getSession();

  return (
    <nav className="themed-nav">
      <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
        <Link
          href="/"
          className="font-semibold tracking-tight themed-heading hover:opacity-70 transition-opacity"
        >
          Principia Synthesia
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/search" className="themed-nav-link">
            Search
          </Link>
          <Link href="/category" className="themed-nav-link">
            Categories
          </Link>
          <Link href="/timeline" className="themed-nav-link">
            Timeline
          </Link>
          <Link href="/organizations" className="themed-nav-link">
            Organizations
          </Link>
          {session && (
            <>
              <Link href="/settings/theme" className="themed-nav-link">
                Theme
              </Link>
              <Link href={`/${session.userSlug}`} className="themed-nav-link font-medium">
                {session.userSlug}
              </Link>
            </>
          )}
          {session ? (
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="themed-btn-ghost">
                Sign out
              </button>
            </form>
          ) : (
            <>
              <Link href="/signup" className="themed-nav-link">
                Sign up
              </Link>
              <Link href="/login" className="themed-nav-link">
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
