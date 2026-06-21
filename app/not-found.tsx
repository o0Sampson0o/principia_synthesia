import Link from "next/link"
import { getSession } from "@/lib/auth"

export default async function NotFound() {
  const session = await getSession()

  return (
    <main className="max-w-3xl mx-auto px-6 py-24 text-center">
      <p className="ps-eyebrow mb-5">404</p>
      <h1 className="ps-display themed-heading mb-4" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
        Page not found
      </h1>
      <p className="themed-muted mb-10" style={{ fontSize: "0.9375rem" }}>This page doesn&rsquo;t exist.</p>
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
