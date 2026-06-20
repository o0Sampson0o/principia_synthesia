"use client"

import Link from "next/link"
import type { SessionPayload } from "@/lib/auth"
import { useNavMenu } from "@/components/useNavMenu"
import NotificationsBell from "@/components/NotificationsBell"

const NOTIFICATIONS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS === "true";

const NAV_LINKS = [
  { href: "/search",        label: "Search" },
  { href: "/category",      label: "Categories" },
  { href: "/timeline",      label: "Timeline" },
  { href: "/organizations", label: "Organizations" },
] as const;

export default function NavClient({ session }: { session: SessionPayload | null }) {
  const { open, setOpen, navPanelRef, hamburgerRef } = useNavMenu()

  return (
    <nav className="nav-glass sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-6">

        {/* Logo */}
        <Link
          href="/"
          className="themed-heading font-semibold shrink-0 hover:opacity-70 transition-opacity"
          style={{ fontSize: "0.9375rem", letterSpacing: "-0.045em" }}
        >
          Principia Synthesia
        </Link>

        {/* Desktop centre links */}
        <div className="hidden md:flex items-center gap-0.5 flex-1">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="themed-nav-link px-3 py-1.5 rounded-md hover:bg-[var(--muted)] transition-colors"
              style={{ fontSize: "0.8125rem" }}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Desktop right */}
        <div className="hidden md:flex items-center gap-2 ml-auto shrink-0">
          {session ? (
            <>
              {NOTIFICATIONS_ENABLED && <NotificationsBell />}
              <Link
                href={`/${session.userSlug}`}
                className="themed-btn-outline"
                style={{ fontSize: "0.8125rem", paddingTop: "0.375rem", paddingBottom: "0.375rem" }}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: "var(--accent)",
                    color: "var(--accent-foreground)",
                    fontSize: "0.5rem",
                    fontWeight: 700,
                  }}
                >
                  {session.userSlug.charAt(0).toUpperCase()}
                </span>
                @{session.userSlug}
              </Link>
              <form action="/api/auth/logout" method="POST">
                <button type="submit" className="themed-btn-ghost" style={{ fontSize: "0.8125rem" }}>
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="themed-btn-ghost" style={{ fontSize: "0.8125rem" }}>
                Sign in
              </Link>
              <Link
                href="/signup"
                className="themed-btn-accent rounded-md"
                style={{ fontSize: "0.8125rem", paddingTop: "0.4rem", paddingBottom: "0.4rem", paddingLeft: "0.875rem", paddingRight: "0.875rem" }}
              >
                Get started
              </Link>
            </>
          )}
        </div>

        {/* Hamburger — mobile */}
        <button
          ref={hamburgerRef}
          type="button"
          onClick={() => setOpen(o => !o)}
          className="md:hidden ml-auto w-9 h-9 flex items-center justify-center rounded-md themed-nav-link hover:bg-[var(--muted)] transition-colors"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label="Toggle navigation"
        >
          {open ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18" /><path d="M6 6l12 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
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
          className="md:hidden themed-surface border-t themed-border"
        >
          <div className="max-w-6xl mx-auto px-5 py-2 flex flex-col">
            {NAV_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className="themed-nav-link py-3 border-b themed-border text-sm last:border-b-0">
                {label}
              </Link>
            ))}
            {session ? (
              <>
                <Link
                  href={`/${session.userSlug}`}
                  className="themed-nav-link font-medium py-3 border-b themed-border text-sm"
                >
                  @{session.userSlug}
                </Link>
                <form action="/api/auth/logout" method="POST" className="py-3">
                  <button type="submit" className="themed-btn-ghost text-sm text-left w-full">Sign out</button>
                </form>
              </>
            ) : (
              <div className="flex gap-3 py-3">
                <Link href="/login" className="themed-btn-outline flex-1 justify-center text-sm">Sign in</Link>
                <Link href="/signup" className="themed-btn-accent flex-1 justify-center text-sm rounded-md">Get started</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
