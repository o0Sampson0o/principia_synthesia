"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import TimelineViewToggle from "./TimelineViewToggle"
import TimelineKeyboardNav, { useKeyboardNavContext } from "./TimelineKeyboardNav"
import type { EventRow } from "./ProportionalTimeline"

const ProportionalTimeline = dynamic(() => import("./ProportionalTimeline"), {
  ssr: false,
  loading: () => (
    <div className="themed-muted text-sm py-8 text-center">Loading…</div>
  ),
})

type Props = {
  rows: EventRow[]
  activeView: "visual" | "list"
  q: string | undefined
  era: string | undefined
  category: string | undefined
  pubFilter: string | undefined
  from: string | undefined
  to: string | undefined
}

function fmtDate(date: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString("en-US", opts ?? {
    month: "short", day: "numeric", year: "numeric",
  })
}

function ListEventRow({
  event,
  index,
  onOpen,
}: {
  event: EventRow
  index: number
  onOpen: (e: EventRow) => void
}) {
  const { focusIndex, registerRef } = useKeyboardNavContext()
  const isFocused = focusIndex === index

  return (
    <li
      ref={(el) => registerRef(index, el)}
      tabIndex={isFocused ? 0 : -1}
      aria-current={isFocused ? "true" : undefined}
      className="focus:outline-none"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <button
        type="button"
        onClick={() => onOpen(event)}
        className="group w-full text-left focus:outline-none"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
          padding: "1rem 0.5rem 1rem 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          width: "100%",
          transition: "background-color 0.1s",
        }}
        tabIndex={-1}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--foreground)",
              fontFamily: "system-ui, -apple-system, sans-serif",
              lineHeight: 1.4,
              marginBottom: 5,
            }}
          >
            {event.title}
          </p>

          {/* Meta line */}
          <p
            style={{
              fontSize: "0.5625rem",
              fontFamily: "ui-monospace, monospace",
              color: "var(--muted-foreground)",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              marginBottom: event.description ? 7 : 0,
            }}
          >
            {fmtDate(event.eventDate)}
            {event.publisherSlug ? ` · @${event.publisherSlug}` : ""}
            {event.category ? ` · ${event.category}` : ""}
          </p>

          {/* Description snippet */}
          {event.description && (
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--muted-foreground)",
                lineHeight: 1.65,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical" as const,
                overflow: "hidden",
              }}
            >
              {event.description}
            </p>
          )}
        </div>

        {/* Arrow */}
        <span
          aria-hidden="true"
          className="opacity-0 group-hover:opacity-60 transition-opacity"
          style={{
            color: "var(--muted-foreground)",
            fontSize: "0.875rem",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          →
        </span>
      </button>
    </li>
  )
}

export default function TimelineClientShell({
  rows,
  activeView,
  q,
  era,
  category,
  pubFilter,
  from,
  to,
}: Props) {
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const openModal = useCallback((event: EventRow) => {
    setSelectedEvent(event)
    dialogRef.current?.showModal()
  }, [])

  const closeModal = useCallback(() => {
    dialogRef.current?.close()
  }, [])

  // Group rows by year, sorted descending
  const grouped = useMemo(() => {
    const map = new Map<number, EventRow[]>()
    for (const row of rows) {
      const year = new Date(row.eventDate).getFullYear()
      if (!map.has(year)) map.set(year, [])
      map.get(year)!.push(row)
    }
    const sorted = Array.from(map.entries()).sort(([a], [b]) => b - a)
    for (const [, evts] of sorted) {
      evts.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
    }
    return sorted
  }, [rows])

  // Build a flat index map so keyboard nav indices are global across year groups
  const flatRows = useMemo(() => grouped.flatMap(([, evts]) => evts), [grouped])

  return (
    <>
      <TimelineViewToggle
        activeView={activeView}
        q={q}
        era={era}
        category={category}
        pubFilter={pubFilter}
        from={from}
        to={to}
      />

      {activeView === "visual" && <ProportionalTimeline rows={rows} />}

      {activeView === "list" && (
        <>
          {rows.length === 0 ? (
            <div className="py-20 text-center">
              <p className="ps-eyebrow mb-3">No results</p>
              <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>
                No events match the current filters.
              </p>
            </div>
          ) : (
            <TimelineKeyboardNav count={flatRows.length}>
              <div>
                {grouped.map(([year, evts]) => {
                  const yearStartIndex = flatRows.indexOf(evts[0])
                  return (
                    <div key={year} className="mb-12">
                      {/* Year header */}
                      <div
                        className="flex items-baseline gap-5 mb-0"
                        style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: 0 }}
                      >
                        <span
                          className="tabular-nums"
                          style={{
                            fontFamily: "ui-monospace, monospace",
                            fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                            letterSpacing: "-0.04em",
                            fontWeight: 500,
                            lineHeight: 1,
                            color: "var(--foreground)",
                            flexShrink: 0,
                          }}
                        >
                          {year}
                        </span>
                        <span
                          className="themed-muted"
                          style={{
                            fontSize: "0.5625rem",
                            fontFamily: "ui-monospace, monospace",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                          }}
                        >
                          {evts.length} event{evts.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Events in this year */}
                      <ul>
                        {evts.map((event, i) => (
                          <ListEventRow
                            key={event.id}
                            event={event}
                            index={yearStartIndex + i}
                            onOpen={openModal}
                          />
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </TimelineKeyboardNav>
          )}
        </>
      )}

      {/* ── Event detail modal ── */}
      <dialog
        ref={dialogRef}
        className="w-[min(90vw,34rem)] rounded-xl themed-card shadow-xl flex flex-col"
        onClick={(e) => { if (e.target === dialogRef.current) closeModal() }}
        onClose={() => setSelectedEvent(null)}
        aria-labelledby="list-event-modal-title"
      >
        {selectedEvent && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexShrink: 0 }}>
              <div style={{ flex: 1, paddingRight: 16 }}>
                <p
                  style={{
                    fontSize: "0.5625rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontFamily: "ui-monospace, monospace",
                    color: "var(--muted-foreground)",
                    marginBottom: 10,
                  }}
                >
                  {fmtDate(selectedEvent.eventDate, { month: "long", day: "numeric", year: "numeric" })}
                  {selectedEvent.category ? ` · ${selectedEvent.category}` : ""}
                </p>
                <h2
                  id="list-event-modal-title"
                  className="ps-display themed-heading"
                  style={{ fontSize: "clamp(1.25rem, 3vw, 1.75rem)" }}
                >
                  {selectedEvent.title}
                </h2>
              </div>
              <button type="button" onClick={closeModal} className="dialog-close-btn" aria-label="Close">
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
              {selectedEvent.description && (
                <p
                  style={{
                    fontSize: "0.9375rem",
                    lineHeight: 1.75,
                    color: "var(--muted-foreground)",
                  }}
                >
                  {selectedEvent.description}
                </p>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 16,
                borderTop: "1px solid var(--border)",
                marginTop: 20,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontFamily: "ui-monospace, monospace",
                  color: "var(--muted-foreground)",
                }}
              >
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
    </>
  )
}
