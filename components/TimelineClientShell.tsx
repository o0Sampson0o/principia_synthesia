"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import TimelineViewToggle from "./TimelineViewToggle"
import type { EventRow } from "./ProportionalTimeline"

const VisualTimeline = dynamic(() => import("./VisualTimeline"), {
  ssr: false,
  loading: () => (
    <div className="themed-muted text-sm py-8 text-center">Loading…</div>
  ),
})

const ProportionalTimeline = dynamic(() => import("./ProportionalTimeline"), {
  ssr: false,
  loading: () => (
    <div className="themed-muted text-sm py-8 text-center">Loading proportional view…</div>
  ),
})

type Props = {
  rows: EventRow[]
  activeView: "visual" | "list"
  category: string | undefined
  pubFilter: string | undefined
  from: string | undefined
  to: string | undefined
}

export default function TimelineClientShell({
  rows,
  activeView,
  category,
  pubFilter,
  from,
  to,
}: Props) {
  const [proportional, setProportional] = useState(false)

  return (
    <>
      <TimelineViewToggle
        activeView={activeView}
        category={category}
        pubFilter={pubFilter}
        from={from}
        to={to}
        proportional={proportional}
        onToggleProportional={() => setProportional((p) => !p)}
      />
      {activeView === "visual" && !proportional && <VisualTimeline rows={rows} />}
      {activeView === "visual" && proportional && <ProportionalTimeline rows={rows} />}
    </>
  )
}
