"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import Link from "next/link"

import { yearMarkerInterval, deriveEras, toFractionalYear, assignEraLabelLanes } from "@/lib/timeline-utils"
import { clusterEvents, clusteringThreshold } from "@/lib/timeline-clusters"

const BUFFER_MULTIPLIER = 1.5
const TOP_PADDING_PX = 60
const BOTTOM_PADDING_PX = 120

export type { EventRow } from "@/lib/timeline-utils"
import type { EventRow } from "@/lib/timeline-utils"

export default function ProportionalTimeline({ rows }: { rows: EventRow[] }) {
  const [pxPerYear, setPxPerYear] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 30 : 80
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
    function computeHeight() {
      const vh65 = Math.round(window.innerHeight * 0.65)
      setContainerHeight(Math.min(720, Math.max(320, vh65)))
    }
    computeHeight()
    window.addEventListener('resize', computeHeight)
    return () => window.removeEventListener('resize', computeHeight)
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
    return {
      minYear: Math.floor(loFract),
      maxYear: Math.ceil(hiFract),
      minFractYear: loFract,
      maxFractYear: hiFract,
      rowsWithYear: withYear,
    }
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
      el.scrollTo({
        top: sortedEvents[idx].offset - containerHeight / 4,
        behavior: "smooth",
      })
    },
    [sortedEvents, containerHeight],
  )

  useLayoutEffect(() => {
    if (navIndex < 0) return
    const sortedId = sortedEvents[navIndex]?.row.id
    if (sortedId === undefined) return
    const btn = dotRefs.current.get(sortedId)
    if (btn) btn.focus()
  }, [navIndex, sortedEvents])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (sortedEvents.length === 0) return
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          {
            const next = navIndex < sortedEvents.length - 1 ? navIndex + 1 : navIndex
            setNavIndex(next)
            scrollToIndex(next)
          }
          break
        case "ArrowUp":
          e.preventDefault()
          {
            const next = navIndex > 0 ? navIndex - 1 : 0
            setNavIndex(next)
            scrollToIndex(next)
          }
          break
        case "Home":
          e.preventDefault()
          setNavIndex(0)
          scrollToIndex(0)
          break
        case "End":
          e.preventDefault()
          setNavIndex(sortedEvents.length - 1)
          scrollToIndex(sortedEvents.length - 1)
          break
        default:
          break
      }
    },
    [navIndex, sortedEvents, scrollToIndex]
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
    [cardMode, pxPerYear, threshold, visibleRows]
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

  return (
    <div className="w-full">
      {/* Controls: Back/Next navigation + zoom */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 mb-3 text-sm">
        {/* Navigation group */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = navIndex - 1
              setNavIndex(next)
              scrollToIndex(next)
            }}
            disabled={navIndex <= 0}
            className="themed-btn-ghost px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Scroll to previous event"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => {
              let next: number
              if (navIndex === -1) {
                const firstAhead = sortedEvents.findIndex(({ offset }) => offset > scrollTop)
                next = firstAhead === -1 ? 0 : firstAhead
              } else {
                next = navIndex + 1
              }
              setNavIndex(next)
              scrollToIndex(next)
            }}
            disabled={navIndex >= sortedEvents.length - 1}
            className="themed-btn-ghost px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Scroll to next event"
          >
            Next →
          </button>
        </div>
        {/* Zoom group */}
        <div className="flex items-center gap-1 ml-2">
          <span className="themed-muted text-xs">Zoom</span>
          <button
            type="button"
            onClick={() => setPxPerYear((p) => p > 20 ? Math.max(20, p - 20) : Math.max(2, p - 4))}
            className="themed-btn-ghost px-2 py-1"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="themed-muted w-24 text-center tabular-nums text-xs">
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
        </div>
        {/* Current year */}
        <span className="themed-muted ml-auto text-xs tabular-nums" aria-live="polite">~{currentYear}</span>
      </div>
      <p className="sm:hidden text-xs themed-muted mb-2">Scroll to navigate · tap a dot to open</p>

      {/* Scroll container — fixed height keeps the page layout stable */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        className="overflow-y-auto overscroll-contain rounded-md border themed-border scrollbar-none p-4"
        style={{ height: containerHeight }}
      >
        {/* Canvas — height is data-driven; extra 80px bottom padding so last card isn't clipped */}
        <div className="relative" style={{ height: totalHeight, contain: "layout" } as CSSProperties}>
          <div className="absolute left-[7px] top-0 bottom-0 w-0.5 bg-[var(--border)]" />

        {eraLabels.map((era) => (
          <div
            key={era.name}
            className="absolute left-0 right-0 flex items-center z-10"
            style={{
              top: Math.max(0, topOffset(era.startYear) - 22),
              transform: era.lane > 0 ? `translateX(${era.lane * 64}px)` : undefined,
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-widest themed-muted ml-6 pr-3 bg-[var(--background)] whitespace-nowrap">
              {era.name}
            </span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
        ))}

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

        {cardMode === "dot" && clusters
          ? clusters.map((cluster) => {
              const firstEvent = cluster.events[0]
              const fractYear = toFractionalYear(new Date(firstEvent.eventDate))
              const isSingle = cluster.events.length === 1
              const sortedIdx = sortedEvents.findIndex((s) => s.row.id === firstEvent.id)
              const isFocused = navIndex === sortedIdx
              return (
                <div
                  key={cluster.id}
                  className="absolute flex items-center"
                  style={{ top: topOffset(fractYear), left: 0 }}
                >
                  {isSingle ? (
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) dotRefs.current.set(firstEvent.id, el)
                        else dotRefs.current.delete(firstEvent.id)
                      }}
                      tabIndex={isFocused ? 0 : -1}
                      aria-label={`View details: ${firstEvent.title}`}
                      aria-current={isFocused ? "true" : undefined}
                      onClick={() => {
                        setNavIndex(sortedIdx)
                        openModal(firstEvent)
                      }}
                      className="relative z-10 w-2 h-2 rounded-full ring-2 ring-[var(--background)] bg-[var(--foreground)] cursor-pointer p-0 hover:opacity-70 transition-opacity focus-visible:ring-[var(--input-focus-border)] focus-visible:outline-none focus-visible:ring-4"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => openClusterModal(cluster.events)}
                      aria-label={`${cluster.events.length} events clustered around ${cluster.year}`}
                      className="relative z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-[var(--foreground)] text-[var(--background)] text-xs font-bold cursor-pointer hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--input-focus-border)] px-2"
                    >
                      {cluster.events.length}
                    </button>
                  )}
                </div>
              )
            })
          : visibleRows.map(({ row: e, fractYear }) => {
              const sortedIdx = sortedEvents.findIndex((s) => s.row.id === e.id)
              const isFocused = navIndex === sortedIdx
              return (
                <div
                  key={e.id}
                  className="absolute flex items-start gap-4"
                  style={{
                    top: topOffset(fractYear),
                    left: 0,
                    right: 0,
                  }}
                >
                  <div className="w-4 shrink-0 flex justify-center mt-1">
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) dotRefs.current.set(e.id, el)
                        else dotRefs.current.delete(e.id)
                      }}
                      tabIndex={isFocused ? 0 : -1}
                      aria-label={`View details: ${e.title}`}
                      aria-current={isFocused ? "true" : undefined}
                      onClick={() => {
                        setNavIndex(sortedIdx)
                        openModal(e)
                      }}
                      className="relative z-10 w-2 h-2 rounded-full ring-2 ring-[var(--background)] bg-[var(--foreground)] cursor-pointer p-0 hover:opacity-70 transition-opacity focus-visible:ring-[var(--input-focus-border)] focus-visible:outline-none focus-visible:ring-4"
                    />
                  </div>

                  {cardMode === "full" && (
                    <div className="flex-1 themed-card p-3 -mt-0.5">
                      <button
                        type="button"
                        onClick={() => openModal(e)}
                        className="text-sm font-medium themed-link text-left hover:opacity-70 transition-opacity"
                      >
                        {e.title}
                      </button>
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
                      <button
                        type="button"
                        onClick={() => openModal(e)}
                        className="text-xs font-medium themed-link text-left hover:opacity-70 transition-opacity"
                      >
                        {e.title}
                      </button>
                    </div>
                  )}
                </div>
              )
            })
        }
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="w-[min(90vw,32rem)] rounded-xl themed-card shadow-2xl flex flex-col"
        onClick={(e) => { if (e.target === dialogRef.current) closeModal() }}
        onClose={() => setSelectedEvent(null)}
        aria-labelledby="event-modal-title"
      >
        {selectedEvent && (
          <div className="flex flex-col min-h-0 overflow-hidden">
            {/* Header — fixed, never scrolls */}
            <div className="flex items-start justify-between mb-4 flex-shrink-0">
              <h2 id="event-modal-title" className="text-xl font-bold themed-heading pr-4">
                {selectedEvent.title}
              </h2>
              <button type="button" onClick={closeModal} className="dialog-close-btn" aria-label="Close">
                ✕
              </button>
            </div>

            {/* Body — scrolls when content is long */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-sm themed-muted">
                  {new Date(selectedEvent.eventDate).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                {selectedEvent.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full themed-surface border themed-border themed-secondary">
                    {selectedEvent.category}
                  </span>
                )}
              </div>

              {selectedEvent.description && (
                <p className="text-sm themed-secondary leading-relaxed">{selectedEvent.description}</p>
              )}
            </div>

            {/* Footer — fixed, never scrolls */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t themed-border flex-shrink-0">
              {selectedEvent.publisherSlug ? (
                <span className="text-xs themed-muted">@{selectedEvent.publisherSlug}</span>
              ) : (
                <span />
              )}
              {selectedEvent.publisherSlug && (
                <Link
                  href={`/${selectedEvent.publisherSlug}/events/${selectedEvent.slug}`}
                  className="themed-btn-primary text-sm px-4 py-2"
                  onClick={closeModal}
                >
                  View full page →
                </Link>
              )}
            </div>
          </div>
        )}
      </dialog>

      <dialog
        ref={clusterDialogRef}
        className="w-[min(90vw,32rem)] rounded-xl themed-card shadow-2xl flex flex-col"
        onClick={(e) => { if (e.target === clusterDialogRef.current) closeClusterModal() }}
        onClose={() => setClusterEvents_(null)}
        aria-labelledby="cluster-modal-title"
      >
        {clusterEvents_ && (
          <div className="flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-start justify-between mb-4 flex-shrink-0">
              <h2 id="cluster-modal-title" className="text-xl font-bold themed-heading pr-4">
                {clusterEvents_.length} events
              </h2>
              <button type="button" onClick={closeClusterModal} className="dialog-close-btn" aria-label="Close">
                ✕
              </button>
            </div>
            <ul className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
              {clusterEvents_.map((e) => (
                <li key={`${e.id}-${e.slug}`} className="border-b themed-border pb-3 last:border-b-0 last:pb-0">
                  <p className="text-sm font-medium themed-heading">{e.title}</p>
                  <p className="text-xs themed-muted mt-0.5">
                    {new Date(e.eventDate).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  {e.publisherSlug && (
                    <Link
                      href={`/${e.publisherSlug}/events/${e.slug}`}
                      className="text-xs themed-link mt-1 inline-block"
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
