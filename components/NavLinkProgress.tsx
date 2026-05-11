"use client";

import { useLinkStatus } from "next/link";

/**
 * Shows a pulsing dot next to nav when a link navigation is pending.
 * Uses Next.js 16's useLinkStatus() hook — no third-party library needed.
 */
export function NavLinkProgress() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 rounded-full bg-current animate-pulse opacity-60"
    />
  );
}
