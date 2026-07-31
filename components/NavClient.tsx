"use client"

import Link from "next/link"
import type { SessionPayload } from "@/lib/auth"
import { useNavMenu } from "@/components/useNavMenu"
import NotificationsBell from "@/components/NotificationsBell"
import PrincipiaMark from "@/components/PrincipiaMark"

const NOTIFICATIONS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS === "true";

const NAV_LINKS = [
  { href: "/search",        label: "Search" },
  { href: "/timeline",      label: "Timeline" },
  { href: "/organizations", label: "Organizations" },
] as const;

export default function NavClient({ session }: { session: SessionPayload | null }) {
  const { open, setOpen, navPanelRef, hamburgerRef } = useNavMenu()

  return (
    <nav className="nav-glass sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-5 h-12 flex items-center gap-6">

        <Link
          href="/"
          className="themed-heading shrink-0 font-semibold hover:opacity-60 transition-opacity inline-flex items-center gap-2"
          style={{ fontSize: "0.875rem", letterSpacing: "-0.05em" }}
        >
          <PrincipiaMark size={17} className="shrink-0" />
          Principia Synthesia
        </Link>

        <div className="hidden md:flex items-center gap-0.5 flex-1">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="themed-nav-link px-2.5 py-1.5 hover:text-[var(--foreground)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:rounded"
              style={{ fontSize: "0.8125rem" }}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2 ml-auto shrink-0">
          {session ? (
            <>
              {NOTIFICATIONS_ENABLED && <NotificationsBell />}
              <Link href={`/${session.userSlug}`} className="ps-user-pill">
                <span className="ps-avatar-dot">{session.userSlug.charAt(0).toUpperCase()}</span>
                @{session.userSlug}
              </Link>
              <Link
                href="/settings"
                aria-label="Settings"
                title="Settings"
                className="w-8 h-8 flex items-center justify-center rounded themed-nav-link hover:text-[var(--foreground)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
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
                style={{ fontSize: "0.8125rem", padding: "0.375rem 0.875rem" }}
              >
                Get started
              </Link>
            </>
          )}
        </div>

        <button
          ref={hamburgerRef}
          type="button"
          onClick={() => setOpen(o => !o)}
          className="md:hidden ml-auto w-8 h-8 flex items-center justify-center rounded themed-nav-link hover:bg-[var(--muted)] transition-colors"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label="Toggle navigation"
        >
          {open ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

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
                <Link href={`/${session.userSlug}`} className="themed-nav-link font-medium py-3 border-b themed-border text-sm">
                  @{session.userSlug}
                </Link>
                <Link href="/settings" className="themed-nav-link py-3 border-b themed-border text-sm">
                  Settings
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
