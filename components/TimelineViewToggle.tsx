"use client"

import Link from "next/link"

type Props = {
  activeView: "visual" | "list"
  q: string | undefined
  era: string | undefined
  category: string | undefined
  pubFilter: string | undefined
  from: string | undefined
  to: string | undefined
}

function viewHref(
  view: "visual" | "list",
  q: string | undefined,
  era: string | undefined,
  category: string | undefined,
  pubFilter: string | undefined,
  from: string | undefined,
  to: string | undefined
): string {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (era) params.set("era", era)
  if (category) params.set("category", category)
  if (pubFilter) params.set("publisher", pubFilter)
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  if (view === "list") params.set("view", "list")
  const qs = params.toString()
  return qs ? `/timeline?${qs}` : "/timeline"
}

export default function TimelineViewToggle({ activeView, q, era, category, pubFilter, from, to }: Props) {
  return (
    <div
      className="flex items-end gap-6 mb-8"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {(["visual", "list"] as const).map((v) => {
        const active = activeView === v
        const label = v === "visual" ? "Visual" : "List"
        return (
          <Link
            key={v}
            href={viewHref(v, q, era, category, pubFilter, from, to)}
            style={{
              display: "inline-block",
              fontSize: "0.5625rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontFamily: "ui-monospace, monospace",
              fontWeight: active ? 600 : 400,
              color: active ? "var(--foreground)" : "var(--muted-foreground)",
              paddingBottom: "0.625rem",
              borderBottom: active ? "1.5px solid var(--foreground)" : "1.5px solid transparent",
              marginBottom: "-1px",
              textDecoration: "none",
              transition: "color 0.12s, border-color 0.12s",
            }}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
