"use client"

import { useCallback, useRef, useState } from "react"
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

function ListEventCard({
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
      className="border-b themed-border pb-4 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--input-focus-border)]"
    >
      <button
        type="button"
        onClick={() => onOpen(event)}
        className="text-xl font-medium themed-link text-left hover:opacity-70 transition-opacity"
      >
        {event.title}
      </button>
      <div className="flex items-center gap-3 mt-1 flex-wrap">
        <span className="text-xs themed-muted">
          {new Date(event.eventDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        {event.category && (
          <span className="text-xs px-2 py-0.5 rounded-full themed-surface border themed-border themed-secondary">
            {event.category}
          </span>
        )}
        {event.publisherSlug && (
          <Link
            href={`/${event.publisherSlug}`}
            className="text-xs themed-muted hover:underline"
            tabIndex={-1}
          >
            @{event.publisherSlug}
          </Link>
        )}
      </div>
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
        <TimelineKeyboardNav count={rows.length}>
          <ul className="space-y-4">
            {rows.map((e, i) => (
              <ListEventCard key={e.id} event={e} index={i} onOpen={openModal} />
            ))}
          </ul>
        </TimelineKeyboardNav>
      )}

      <dialog
        ref={dialogRef}
        className="w-[min(90vw,32rem)] rounded-xl themed-card shadow-2xl flex flex-col"
        onClick={(e) => { if (e.target === dialogRef.current) closeModal() }}
        onClose={() => setSelectedEvent(null)}
        aria-labelledby="list-event-modal-title"
      >
        {selectedEvent && (
          <div className="flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-start justify-between mb-4 flex-shrink-0">
              <h2 id="list-event-modal-title" className="text-xl font-bold themed-heading pr-4">
                {selectedEvent.title}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="dialog-close-btn"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

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
    </>
  )
}
