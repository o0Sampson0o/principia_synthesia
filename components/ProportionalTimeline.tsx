"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import Link from "next/link"

import { yearMarkerInterval, deriveEras, toFractionalYear, assignEraLabelLanes } from "@/lib/timeline-utils"
import { clusterEvents, clusteringThreshold } from "@/lib/timeline-clusters"

const BUFFER_MULTIPLIER = 1.5
const TOP_PADDING_PX = 60
const BOTTOM_PADDING_PX = 120
const SPINE_X = 60

export type { EventRow } from "@/lib/timeline-utils"
import type { EventRow } from "@/lib/timeline-utils"

function fmtDate(date: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString("en-US", opts ?? {
    month: "short", day: "numeric", year: "numeric",
  })
}

export default function ProportionalTimeline({ rows }: { rows: EventRow[] }) {
  const [pxPerYear, setPxPerYear] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? 30 : 80
  )
  const [containerHeight, setContainerHeight] = useState(640)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)
  const [clusterEvents_, setClusterEvents_] = useState<EventRow[] | null>(null)
  const [navIndex, setNavIndex] = useState(-1)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const clusterDialogRef = useRef<HTMLDialogElement>(null)

  const handleScroll = useCallback(() => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
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
    function computeHeight() {
      const vh65 = Math.round(window.innerHeight * 0.65)
      setContainerHeight(Math.min(720, Math.max(320, vh65)))
    }
    computeHeight()
    window.addEventListener("resize", computeHeight)
    return () => window.removeEventListener("resize", computeHeight)
  }, [])

  const openModal = useCallback((event: EventRow) => {
    setSelectedEvent(event)
    dialogRef.current?.showModal()
  }, [])

  const closeModal = useCallback(() => {
    dialogRef.current?.close()
  }, [])

  const openClusterModal = useCallback((clusterEvts: EventRow[]) => {
    setClusterEvents_(clusterEvts)
    clusterDialogRef.current?.showModal()
  }, [])

  const closeClusterModal = useCallback(() => {
    clusterDialogRef.current?.close()
  }, [])

  const eras = useMemo(() => deriveEras(rows), [rows])

  const { minYear, maxYear, minFractYear, maxFractYear, rowsWithYear } = useMemo(() => {
    if (rows.length === 0) return { minYear: 0, maxYear: 0, minFractYear: 0, maxFractYear: 0, rowsWithYear: [] }
    let loFract = Infinity
    let hiFract = -Infinity
    const withYear = rows.map((r) => {
      const fractYear = toFractionalYear(new Date(r.eventDate))
      if (fractYear < loFract) loFract = fractYear
      if (fractYear > hiFract) hiFract = fractYear
      return { row: r, fractYear }
    })
    return { minYear: Math.floor(loFract), maxYear: Math.ceil(hiFract), minFractYear: loFract, maxFractYear: hiFract, rowsWithYear: withYear }
  }, [rows])

  const eraLabels = useMemo(
    () => assignEraLabelLanes(eras, pxPerYear, minYear),
    [eras, pxPerYear, minYear],
  )

  const topOffset = useCallback(
    (fractYear: number) => (fractYear - minFractYear) * pxPerYear + TOP_PADDING_PX,
    [minFractYear, pxPerYear],
  )

  const sortedEvents = useMemo(
    () =>
      [...rowsWithYear]
        .sort((a, b) => a.fractYear - b.fractYear)
        .map((item) => ({
          ...item,
          offset: (item.fractYear - minFractYear) * pxPerYear + TOP_PADDING_PX,
        })),
    [rowsWithYear, minFractYear, pxPerYear],
  )

  const dotRefs = useRef<Map<number | string, HTMLButtonElement>>(new Map())

  const scrollToIndex = useCallback(
    (idx: number) => {
      const el = scrollContainerRef.current
      if (!el || idx < 0 || idx >= sortedEvents.length) return
      el.scrollTo({ top: sortedEvents[idx].offset - containerHeight / 4, behavior: "smooth" })
    },
    [sortedEvents, containerHeight],
  )

  useLayoutEffect(() => {
    if (navIndex < 0) return
    if (dialogRef.current?.open) return
    const sortedId = sortedEvents[navIndex]?.row.id
    if (sortedId === undefined) return
    const btn = dotRefs.current.get(sortedId)
    if (btn) btn.focus({ preventScroll: true })
  }, [navIndex, sortedEvents])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (sortedEvents.length === 0) return
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          { const next = navIndex < sortedEvents.length - 1 ? navIndex + 1 : navIndex; setNavIndex(next); scrollToIndex(next) }
          break
        case "ArrowUp":
          e.preventDefault()
          { const next = navIndex > 0 ? navIndex - 1 : 0; setNavIndex(next); scrollToIndex(next) }
          break
        case "Home":
          e.preventDefault()
          setNavIndex(0); scrollToIndex(0)
          break
        case "End":
          e.preventDefault()
          setNavIndex(sortedEvents.length - 1); scrollToIndex(sortedEvents.length - 1)
          break
        default:
          break
      }
    },
    [navIndex, sortedEvents, scrollToIndex],
  )

  const bufferPx = containerHeight * BUFFER_MULTIPLIER
  const cardMode: "full" | "compact" | "dot" =
    pxPerYear >= 60 ? "full" : pxPerYear >= 30 ? "compact" : "dot"

  const viewportTop = scrollTop - bufferPx
  const viewportBottom = scrollTop + containerHeight + bufferPx

  const visibleRows = rowsWithYear.filter(({ fractYear }) => {
    const top = topOffset(fractYear)
    return top >= viewportTop && top <= viewportBottom
  })

  const threshold = clusteringThreshold(pxPerYear)
  const clusters = useMemo(
    () => cardMode === "dot" ? clusterEvents(visibleRows.map((r) => r.row), pxPerYear, threshold) : null,
    [cardMode, pxPerYear, threshold, visibleRows],
  )

  if (rows.length === 0) return null

  const totalHeight = (maxFractYear - minFractYear) * pxPerYear + TOP_PADDING_PX + BOTTOM_PADDING_PX
  const interval = yearMarkerInterval(pxPerYear)
  const firstMarkerYear = Math.ceil(minYear / interval) * interval
  const markerYears: number[] = []
  for (let y = firstMarkerYear; y <= maxYear; y += interval) markerYears.push(y)

  const currentYear = Math.min(
    maxYear,
    Math.max(minYear, Math.round((scrollTop - TOP_PADDING_PX) / pxPerYear + minFractYear)),
  )

  const modeName = cardMode === "full" ? "Detail" : cardMode === "compact" ? "Compact" : "Overview"

  return (
    <div className="w-full">

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-5 mb-4 pb-3 border-b themed-border"
        style={{ fontSize: "0.8125rem" }}
      >
        {/* Nav */}
        <button
          type="button"
          onClick={() => { const n = navIndex - 1; setNavIndex(n); scrollToIndex(n) }}
          disabled={navIndex <= 0}
          className="themed-nav-link hover:text-[var(--foreground)] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          aria-label="Previous event"
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={() => {
            let n: number
            if (navIndex === -1) {
              const fa = sortedEvents.findIndex(({ offset }) => offset > scrollTop)
              n = fa === -1 ? 0 : fa
            } else {
              n = navIndex + 1
            }
            setNavIndex(n); scrollToIndex(n)
          }}
          disabled={navIndex >= sortedEvents.length - 1}
          className="themed-nav-link hover:text-[var(--foreground)] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          aria-label="Next event"
        >
          Next →
        </button>

        <div className="flex-1" />

        {/* Mode label */}
        <span
          className="themed-muted hidden sm:inline"
          style={{ fontSize: "0.5625rem", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "ui-monospace, monospace" }}
        >
          {modeName}
        </span>

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPxPerYear((p) => p > 20 ? Math.max(20, p - 20) : Math.max(2, p - 4))}
            className="themed-muted hover:text-[var(--foreground)] transition-colors"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: "1rem", lineHeight: 1, padding: "0 6px" }}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setPxPerYear((p) => p >= 20 ? Math.min(400, p + 20) : Math.min(20, p + 4))}
            className="themed-muted hover:text-[var(--foreground)] transition-colors"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: "1rem", lineHeight: 1, padding: "0 6px" }}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>

        {/* Current year readout */}
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: "0.9375rem",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--foreground)",
            minWidth: "3.25rem",
            textAlign: "right",
          }}
          aria-live="polite"
          aria-label={`Currently viewing around ${currentYear}`}
        >
          {currentYear}
        </span>
      </div>

      <p
        className="sm:hidden themed-muted mb-3"
        style={{ fontSize: "0.5625rem", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "ui-monospace, monospace" }}
      >
        Scroll to navigate · tap to open
      </p>

      {/* ── Scroll container ─────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        className="overflow-y-auto overscroll-contain scrollbar-none"
        style={{ height: containerHeight }}
      >
        {/* Canvas */}
        <div
          className="relative"
          style={{ height: totalHeight, contain: "layout" } as CSSProperties}
        >

          {/* Spine */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: SPINE_X,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: "var(--border)",
            }}
          />

          {/* Year markers */}
          {markerYears.map((year) => {
            const y = topOffset(year)
            return (
              <div key={year} aria-hidden="true">
                {/* Tick — straddles the spine */}
                <div style={{
                  position: "absolute",
                  top: y,
                  left: SPINE_X - 3,
                  width: 7,
                  height: 1,
                  backgroundColor: "var(--border)",
                  pointerEvents: "none",
                }} />
                {/* Label — right-aligned in left column */}
                <span style={{
                  position: "absolute",
                  top: y - 6,
                  left: 4,
                  width: SPINE_X - 12,
                  textAlign: "right",
                  fontSize: "0.5rem",
                  fontFamily: "ui-monospace, monospace",
                  color: "var(--muted-foreground)",
                  lineHeight: 1,
                  userSelect: "none",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}>
                  {year}
                </span>
              </div>
            )
          })}

          {/* Era labels */}
          {eraLabels.map((era) => {
            const y = topOffset(era.startYear)
            return (
              <div
                key={era.name}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: y - 9,
                  left: SPINE_X + 14 + era.lane * 64,
                  right: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  zIndex: 10,
                  pointerEvents: "none",
                }}
              >
                <span style={{
                  fontSize: "0.4375rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--muted-foreground)",
                  backgroundColor: "var(--background)",
                  paddingRight: 6,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}>
                  {era.name}
                </span>
                <div style={{
                  flex: 1,
                  height: 1,
                  backgroundColor: "var(--border)",
                  opacity: 0.35,
                }} />
              </div>
            )
          })}

          {/* ── Events ── */}
          {cardMode === "dot" && clusters
            ? clusters.map((cluster) => {
                const firstEvent = cluster.events[0]
                const fractYear = toFractionalYear(new Date(firstEvent.eventDate))
                const y = topOffset(fractYear)
                const isSingle = cluster.events.length === 1
                const sortedIdx = sortedEvents.findIndex((s) => s.row.id === firstEvent.id)
                const isFocused = navIndex === sortedIdx

                if (isSingle) {
                  return (
                    <button
                      key={cluster.id}
                      type="button"
                      ref={(el) => {
                        if (el) dotRefs.current.set(firstEvent.id, el)
                        else dotRefs.current.delete(firstEvent.id)
                      }}
                      tabIndex={isFocused ? 0 : -1}
                      aria-label={`View: ${firstEvent.title}`}
                      aria-current={isFocused ? "true" : undefined}
                      onClick={() => { setNavIndex(sortedIdx); openModal(firstEvent) }}
                      style={{
                        position: "absolute",
                        top: y - 6,
                        left: SPINE_X - 6,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        backgroundColor: isFocused ? "var(--accent)" : "var(--muted-foreground)",
                        opacity: isFocused ? 1 : 0.5,
                        boxShadow: isFocused
                          ? "0 0 0 2.5px var(--background), 0 0 0 4.5px var(--accent)"
                          : "0 0 0 2.5px var(--background)",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        zIndex: 10,
                        outline: "none",
                        transition: "opacity 0.12s, box-shadow 0.12s, background-color 0.12s",
                      }}
                      className="focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    />
                  )
                }

                // Cluster pill
                return (
                  <button
                    key={cluster.id}
                    type="button"
                    onClick={() => openClusterModal(cluster.events)}
                    aria-label={`${cluster.events.length} events near ${Math.round(fractYear)}`}
                    style={{
                      position: "absolute",
                      top: y - 10,
                      left: SPINE_X - 13,
                      minWidth: 26,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border)",
                      fontSize: "0.5rem",
                      fontFamily: "ui-monospace, monospace",
                      fontWeight: 600,
                      color: "var(--muted-foreground)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 5px",
                      cursor: "pointer",
                      zIndex: 10,
                      outline: "none",
                      boxShadow: "0 0 0 2px var(--background)",
                      transition: "border-color 0.12s, color 0.12s",
                    }}
                    className="hover:text-[var(--foreground)] hover:border-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    {cluster.events.length}
                  </button>
                )
              })

            : visibleRows.map(({ row: e, fractYear }) => {
                const y = topOffset(fractYear)
                const sortedIdx = sortedEvents.findIndex((s) => s.row.id === e.id)
                const isFocused = navIndex === sortedIdx

                return (
                  <div
                    key={e.id}
                    style={{ position: "absolute", top: y, left: 0, right: 0, zIndex: isFocused ? 20 : 1 }}
                  >
                    {/* Dot — keyboard nav anchor */}
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) dotRefs.current.set(e.id, el)
                        else dotRefs.current.delete(e.id)
                      }}
                      tabIndex={isFocused ? 0 : -1}
                      aria-label={`View: ${e.title}`}
                      aria-current={isFocused ? "true" : undefined}
                      onClick={() => { setNavIndex(sortedIdx); openModal(e) }}
                      style={{
                        position: "absolute",
                        top: -5,
                        left: SPINE_X - 5,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: isFocused ? "var(--accent)" : "var(--background)",
                        border: `1.5px solid ${isFocused ? "var(--accent)" : "var(--border)"}`,
                        boxShadow: isFocused
                          ? "0 0 0 2.5px var(--background), 0 0 0 4.5px var(--accent)"
                          : "0 0 0 2.5px var(--background)",
                        padding: 0,
                        cursor: "pointer",
                        zIndex: 2,
                        outline: "none",
                        transition: "background-color 0.12s, border-color 0.12s, box-shadow 0.12s",
                      }}
                    />

                    {/* Connector line (full mode only) */}
                    {cardMode === "full" && (
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          top: 0,
                          left: SPINE_X + 5,
                          width: 12,
                          height: 1,
                          backgroundColor: "var(--border)",
                          opacity: 0.5,
                          pointerEvents: "none",
                        }}
                      />
                    )}

                    {/* Full card content */}
                    {cardMode === "full" && (
                      <div style={{ position: "absolute", top: -15, left: SPINE_X + 19, right: 8 }}>
                        <button
                          type="button"
                          onClick={() => openModal(e)}
                          style={{
                            textAlign: "left",
                            display: "block",
                            width: "100%",
                            cursor: "pointer",
                            background: "none",
                            border: "none",
                            padding: 0,
                          }}
                        >
                          <span style={{
                            display: "block",
                            fontSize: "0.8125rem",
                            fontWeight: 400,
                            color: "var(--foreground)",
                            lineHeight: 1.35,
                            fontFamily: "system-ui, -apple-system, sans-serif",
                          }}>
                            {e.title}
                          </span>
                          <span style={{
                            display: "block",
                            marginTop: 3,
                            fontSize: "0.5rem",
                            fontFamily: "ui-monospace, monospace",
                            color: "var(--muted-foreground)",
                            letterSpacing: "0.03em",
                          }}>
                            {fmtDate(e.eventDate)}
                            {e.publisherSlug ? ` · @${e.publisherSlug}` : ""}
                            {e.category ? ` · ${e.category}` : ""}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Compact content */}
                    {cardMode === "compact" && (
                      <div style={{ position: "absolute", top: -8, left: SPINE_X + 13, right: 8 }}>
                        <button
                          type="button"
                          onClick={() => openModal(e)}
                          style={{
                            textAlign: "left",
                            display: "block",
                            cursor: "pointer",
                            background: "none",
                            border: "none",
                            padding: 0,
                          }}
                        >
                          <span style={{
                            fontSize: "0.6875rem",
                            color: "var(--foreground)",
                            fontFamily: "system-ui, -apple-system, sans-serif",
                            lineHeight: 1.25,
                          }}>
                            {e.title}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
          }
        </div>
      </div>

      {/* ── Event modal ─────────────────────────────────────────────── */}
      <dialog
        ref={dialogRef}
        className="w-[min(90vw,34rem)] rounded-xl themed-card shadow-xl flex flex-col"
        onClick={(e) => { if (e.target === dialogRef.current) closeModal() }}
        onClose={() => setSelectedEvent(null)}
        aria-labelledby="event-modal-title"
      >
        {selectedEvent && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexShrink: 0 }}>
              <div style={{ flex: 1, paddingRight: 16 }}>
                <p style={{
                  fontSize: "0.5625rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontFamily: "ui-monospace, monospace",
                  color: "var(--muted-foreground)",
                  marginBottom: 10,
                }}>
                  {fmtDate(selectedEvent.eventDate, { month: "long", day: "numeric", year: "numeric" })}
                  {selectedEvent.category ? ` · ${selectedEvent.category}` : ""}
                </p>
                <h2
                  id="event-modal-title"
                  className="ps-display themed-heading"
                  style={{ fontSize: "clamp(1.25rem, 3vw, 1.75rem)" }}
                >
                  {selectedEvent.title}
                </h2>
              </div>
              <button type="button" onClick={closeModal} className="dialog-close-btn" aria-label="Close">✕</button>
            </div>

            {/* Body */}
            <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
              {selectedEvent.description && (
                <p style={{
                  fontSize: "0.9375rem",
                  lineHeight: 1.75,
                  color: "var(--muted-foreground)",
                }}>
                  {selectedEvent.description}
                </p>
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
              marginTop: 20,
              flexShrink: 0,
            }}>
              <span style={{
                fontSize: "0.6875rem",
                fontFamily: "ui-monospace, monospace",
                color: "var(--muted-foreground)",
              }}>
                {selectedEvent.publisherSlug ? `@${selectedEvent.publisherSlug}` : ""}
              </span>
              {selectedEvent.publisherSlug && (
                <Link
                  href={`/${selectedEvent.publisherSlug}/events/${selectedEvent.slug}`}
                  className="themed-btn-accent rounded-lg"
                  style={{ fontSize: "0.875rem", padding: "0.5rem 1.25rem" }}
                  onClick={closeModal}
                >
                  View full page →
                </Link>
              )}
            </div>
          </div>
        )}
      </dialog>

      {/* ── Cluster modal ───────────────────────────────────────────── */}
      <dialog
        ref={clusterDialogRef}
        className="w-[min(90vw,32rem)] rounded-xl themed-card shadow-xl flex flex-col"
        onClick={(e) => { if (e.target === clusterDialogRef.current) closeClusterModal() }}
        onClose={() => setClusterEvents_(null)}
        aria-labelledby="cluster-modal-title"
      >
        {clusterEvents_ && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexShrink: 0 }}>
              <h2
                id="cluster-modal-title"
                className="ps-display themed-heading"
                style={{ fontSize: "clamp(1.25rem, 3vw, 1.75rem)" }}
              >
                {clusterEvents_.length} events
              </h2>
              <button type="button" onClick={closeClusterModal} className="dialog-close-btn" aria-label="Close">✕</button>
            </div>
            <ul style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
              {clusterEvents_.map((e) => (
                <li
                  key={`${e.id}-${e.slug}`}
                  style={{ borderBottom: "1px solid var(--border)", paddingTop: 12, paddingBottom: 12 }}
                  className="last:border-0"
                >
                  <p style={{ fontSize: "0.875rem", color: "var(--foreground)", marginBottom: 3, fontFamily: "system-ui, sans-serif" }}>
                    {e.title}
                  </p>
                  <p style={{
                    fontSize: "0.5625rem",
                    fontFamily: "ui-monospace, monospace",
                    color: "var(--muted-foreground)",
                    letterSpacing: "0.06em",
                    marginBottom: e.publisherSlug ? 6 : 0,
                  }}>
                    {fmtDate(e.eventDate, { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                  {e.publisherSlug && (
                    <Link
                      href={`/${e.publisherSlug}/events/${e.slug}`}
                      className="themed-link"
                      style={{ fontSize: "0.75rem" }}
                      onClick={closeClusterModal}
                    >
                      View →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </dialog>

    </div>
  )
}
