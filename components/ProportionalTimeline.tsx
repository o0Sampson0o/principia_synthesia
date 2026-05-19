"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import Link from "next/link"

import { categoryColor, yearMarkerInterval } from "@/lib/timeline-utils"

const CONTAINER_HEIGHT_PX = 640
const BUFFER_MULTIPLIER = 1.5
const BUFFER_PX = CONTAINER_HEIGHT_PX * BUFFER_MULTIPLIER

export type { EventRow } from "@/lib/timeline-utils"
import type { EventRow } from "@/lib/timeline-utils"

export default function ProportionalTimeline({ rows }: { rows: EventRow[] }) {
  const [pxPerYear, setPxPerYear] = useState(80)

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [openDotId, setOpenDotId] = useState<number | null>(null)
  const popoverContainerRef = useRef<HTMLDivElement | null>(null)

  const handleScroll = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
    }
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      const el = scrollContainerRef.current
      if (!el) return
      setScrollTop(el.scrollTop)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const mode = pxPerYear >= 60 ? "full" : pxPerYear >= 30 ? "compact" : "dot"
    if (mode !== "dot") setOpenDotId(null)
  }, [pxPerYear])

  useEffect(() => {
    if (openDotId === null) return
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (popoverContainerRef.current && popoverContainerRef.current.contains(target)) return
      setOpenDotId(null)
    }
    document.addEventListener("mousedown", handler)
    document.addEventListener("touchstart", handler)
    return () => {
      document.removeEventListener("mousedown", handler)
      document.removeEventListener("touchstart", handler)
    }
  }, [openDotId])

  const { minYear, maxYear, rowsWithYear } = useMemo(() => {
    if (rows.length === 0) return { minYear: 0, maxYear: 0, rowsWithYear: [] }
    let lo = Infinity
    let hi = -Infinity
    const withYear = rows.map((r) => {
      const y = new Date(r.eventDate).getFullYear()
      if (y < lo) lo = y
      if (y > hi) hi = y
      return { row: r, year: y }
    })
    return { minYear: lo, maxYear: hi, rowsWithYear: withYear }
  }, [rows])

  const topOffset = useCallback(
    (year: number) => (year - minYear) * pxPerYear,
    [minYear, pxPerYear],
  )

  if (rows.length === 0) return null

  const totalHeight = (maxYear - minYear + 1) * pxPerYear

  const cardMode: "full" | "compact" | "dot" =
    pxPerYear >= 60 ? "full" : pxPerYear >= 30 ? "compact" : "dot"

  const interval = yearMarkerInterval(pxPerYear)
  const firstMarkerYear = Math.ceil(minYear / interval) * interval
  const markerYears: number[] = []
  for (let y = firstMarkerYear; y <= maxYear; y += interval) markerYears.push(y)

  const viewportTop = scrollTop - BUFFER_PX
  const viewportBottom = scrollTop + CONTAINER_HEIGHT_PX + BUFFER_PX

  const visibleRows = rowsWithYear.filter(({ year }) => {
    const top = (year - minYear) * pxPerYear
    return top >= viewportTop && top <= viewportBottom
  })

  const currentYear = Math.min(
    maxYear,
    Math.max(minYear, Math.round(scrollTop / pxPerYear) + minYear),
  )

  return (
    <div>
      {/* Zoom controls live outside the scroll area so they stay reachable at all times */}
      <div className="flex items-center gap-2 mb-3 text-sm">
        <span className="themed-muted text-xs">Zoom</span>
        <button
          type="button"
          onClick={() => setPxPerYear((p) => p > 20 ? Math.max(20, p - 20) : Math.max(2, p - 4))}
          className="themed-btn-ghost px-2 py-1"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="themed-muted w-28 text-center tabular-nums text-xs">
          {pxPerYear}px/yr · {cardMode === "full" ? "Full" : cardMode === "compact" ? "Compact" : "Dots"}
        </span>
        <button
          type="button"
          onClick={() => setPxPerYear((p) => p >= 20 ? Math.min(400, p + 20) : Math.min(20, p + 4))}
          className="themed-btn-ghost px-2 py-1"
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="themed-muted ml-auto text-xs tabular-nums" aria-live="polite">
          Viewing ~{currentYear}
        </span>
      </div>

      {/* Scroll container — fixed height keeps the page layout stable */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="overflow-y-auto overscroll-contain rounded-md border themed-border scrollbar-none"
        style={{ height: CONTAINER_HEIGHT_PX }}
      >
        {/* Canvas — height is data-driven; extra 80px bottom padding so last card isn't clipped */}
        <div className="relative" style={{ height: totalHeight + 80, contain: "layout" } as CSSProperties}>
          <div className="absolute left-[7px] top-0 bottom-0 w-0.5 bg-[var(--border)]" />

        {markerYears.map((year) => (
          <div
            key={year}
            className="absolute left-0 flex items-center"
            style={{ top: topOffset(year) }}
          >
            <div className="w-3 h-px bg-[var(--border)] shrink-0" />
            <span className="text-xs themed-muted ml-1 select-none">{year}</span>
          </div>
        ))}

        {visibleRows.map(({ row: e, year }) => {
          const dotColor = categoryColor(e.category)
          const href = e.publisherSlug ? `/${e.publisherSlug}/events/${e.slug}` : "#"

          return (
            <div
              key={e.id}
              className="absolute flex items-start gap-4"
              style={{
                top: topOffset(year),
                left: 0,
                right: 0,
              }}
            >
              {cardMode === "dot" ? (
                <button
                  type="button"
                  aria-label={e.title}
                  aria-expanded={openDotId === e.id}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    setOpenDotId((cur) => (cur === e.id ? null : e.id))
                  }}
                  className="relative z-10 mt-1 w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-[var(--background)] cursor-pointer p-0"
                  style={{ backgroundColor: dotColor }}
                />
              ) : (
                <div
                  className="relative z-10 mt-1 w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-[var(--background)]"
                  style={{ backgroundColor: dotColor }}
                />
              )}

              {cardMode === "full" && (
                <div className="flex-1 themed-card p-3 -mt-0.5">
                  <Link href={href} className="text-sm font-medium themed-link">
                    {e.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs themed-muted">
                      {new Date(e.eventDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {e.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full themed-surface border themed-border themed-secondary">
                        {e.category}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {cardMode === "compact" && (
                <div className="flex-1 py-0.5 px-2 text-xs">
                  <Link href={href} className="text-xs font-medium themed-link">
                    {e.title}
                  </Link>
                </div>
              )}

              {cardMode === "dot" && openDotId === e.id && (
                <div
                  ref={popoverContainerRef}
                  className="absolute themed-card p-3 shadow-lg z-[100] w-56"
                  style={{ left: 24, top: 0 }}
                  role="dialog"
                  aria-label={e.title}
                >
                  <Link href={href} className="text-sm font-medium themed-link">
                    {e.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs themed-muted">
                      {new Date(e.eventDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {e.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full themed-surface border themed-border themed-secondary">
                        {e.category}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
