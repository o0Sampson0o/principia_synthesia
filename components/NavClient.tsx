"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import type { SessionPayload } from "@/lib/auth"

export default function NavClient({ session }: { session: SessionPayload | null }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const navPanelRef = useRef<HTMLDivElement>(null)
  const hamburgerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (navPanelRef.current?.contains(document.activeElement)) {
      hamburgerRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return

    const panel = navPanelRef.current
    if (!panel) return

    const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

    function getFocusable(): HTMLElement[] {
      return Array.from(panel!.querySelectorAll<HTMLElement>(FOCUSABLE))
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        setOpen(false)
        hamburgerRef.current?.focus()
        return
      }
      if (e.key !== "Tab") return

      const focusable = getFocusable()
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    getFocusable()[0]?.focus()   // move focus into panel on open

    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open])

  return (
    <nav className="themed-nav">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="font-semibold tracking-tight themed-heading hover:opacity-70 transition-opacity"
        >
          Principia Synthesia
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6 text-sm">
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

        {/* Hamburger button — mobile only */}
        <button
          ref={hamburgerRef}
          type="button"
          className="md:hidden w-11 h-11 flex items-center justify-center themed-nav-link"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label="Toggle navigation"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile panel */}
      {open && (
        <div
          ref={navPanelRef}
          id="mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="md:hidden border-t themed-border themed-surface px-4 pb-4 flex flex-col"
        >
          <Link href="/search" className="themed-nav-link block py-3 border-b themed-border text-sm">
            Search
          </Link>
          <Link href="/category" className="themed-nav-link block py-3 border-b themed-border text-sm">
            Categories
          </Link>
          <Link href="/timeline" className="themed-nav-link block py-3 border-b themed-border text-sm">
            Timeline
          </Link>
          <Link href="/organizations" className="themed-nav-link block py-3 border-b themed-border text-sm">
            Organizations
          </Link>
          {session && (
            <>
              <Link href="/settings/theme" className="themed-nav-link block py-3 border-b themed-border text-sm">
                Theme
              </Link>
              <Link
                href={`/${session.userSlug}`}
                className="themed-nav-link font-medium block py-3 border-b themed-border text-sm"
              >
                {session.userSlug}
              </Link>
            </>
          )}
          {session ? (
            <form action="/api/auth/logout" method="POST" className="pt-3">
              <button type="submit" className="themed-btn-ghost w-full text-left text-sm">
                Sign out
              </button>
            </form>
          ) : (
            <>
              <Link href="/signup" className="themed-nav-link block py-3 border-b themed-border text-sm">
                Sign up
              </Link>
              <Link href="/login" className="themed-nav-link block py-3 text-sm">
                Sign in
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
