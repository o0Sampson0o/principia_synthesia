import Link from "next/link"
import { getSession } from "@/lib/auth"

export default async function NotFound() {
  const session = await getSession()

  return (
    <main className="max-w-3xl mx-auto px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight themed-heading mb-3">404</h1>
      <p className="themed-muted mb-8">This page doesn&rsquo;t exist.</p>
      <div className="flex items-center justify-center gap-6">
        <Link href="/" className="text-sm themed-link">
          &larr; Back to home
        </Link>
        {session && (
          <Link href={`/${session.userSlug}`} className="text-sm themed-link">
            My profile &rarr;
          </Link>
        )}
      </div>
    </main>
  )
}
