"use client"

import Link from "next/link"

type Props = {
  activeView: "visual" | "list"
  category: string | undefined
  pubFilter: string | undefined
  from: string | undefined
  to: string | undefined
}

function viewHref(
  view: "visual" | "list",
  category: string | undefined,
  pubFilter: string | undefined,
  from: string | undefined,
  to: string | undefined
): string {
  const params = new URLSearchParams()
  if (category) params.set("category", category)
  if (pubFilter) params.set("publisher", pubFilter)
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  if (view === "list") params.set("view", "list")
  const qs = params.toString()
  return qs ? `/timeline?${qs}` : "/timeline"
}

export default function TimelineViewToggle({ activeView, category, pubFilter, from, to }: Props) {
  return (
    <div className="flex items-center gap-1 mb-6">
      <Link
        href={viewHref("visual", category, pubFilter, from, to)}
        className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
          activeView === "visual"
            ? "themed-surface border themed-border themed-heading"
            : "themed-btn-ghost"
        }`}
      >
        Visual
      </Link>
      <Link
        href={viewHref("list", category, pubFilter, from, to)}
        className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
          activeView === "list"
            ? "themed-surface border themed-border themed-heading"
            : "themed-btn-ghost"
        }`}
      >
        List
      </Link>
    </div>
  )
}
