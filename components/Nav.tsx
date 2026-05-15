import Link from "next/link";
import { getSession } from "@/lib/auth";

export default async function Nav() {
  const session = await getSession();

  return (
    <nav className="themed-nav">
      <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight themed-heading hover:opacity-70 transition-opacity">
          Principia Synthesia
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/search" className="themed-nav-link">Search</Link>
          <Link href="/category" className="themed-nav-link">Categories</Link>
          <Link href="/animations" className="themed-nav-link">Animations</Link>
          <Link href="/objects" className="themed-nav-link">Objects</Link>
          {session && (
            <Link href="/settings/theme" className="themed-nav-link">Theme</Link>
          )}
          {session?.isAdmin && (
            <>
              <Link href="/admin" className="themed-nav-link">Admin</Link>
              <Link href="/admin/articles/new" className="themed-nav-link">New article</Link>
              <Link href="/admin/curriculum" className="themed-nav-link">Curriculum</Link>
            </>
          )}
          {session ? (
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="themed-btn-ghost">Sign out</button>
            </form>
          ) : (
            <Link href="/login" className="themed-nav-link">Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
