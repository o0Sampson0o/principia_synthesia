import Link from "next/link";
import { getSession } from "@/lib/auth";

export default async function Nav() {
  const session = await getSession();

  return (
    <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
        <Link
          href="/"
          className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 hover:opacity-70 transition-opacity"
        >
          Principia Synthesia
        </Link>
          <div className="flex items-center gap-6 text-sm text-zinc-500 dark:text-zinc-400">
            <Link href="/search" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              Search
            </Link>
            <Link href="/category" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              Categories
            </Link>
            <Link href="/animations" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              Animations
            </Link>
            {session && (
            <Link href="/settings/theme" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              Theme
            </Link>
          )}
          {session?.isAdmin && (
            <>
              <Link href="/admin" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                Admin
              </Link>
              <Link href="/admin/articles/new" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                New article
              </Link>
              <Link href="/admin/curriculum" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                Curriculum
              </Link>
            </>
          )}
          {session ? (
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/login" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
