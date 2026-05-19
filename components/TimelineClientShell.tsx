"use client"

import { useCallback, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import TimelineViewToggle from "./TimelineViewToggle"
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
        category={category}
        pubFilter={pubFilter}
        from={from}
        to={to}
      />

      {activeView === "visual" && <ProportionalTimeline rows={rows} />}

      {activeView === "list" && (
        <ul className="space-y-4">
          {rows.map((e) => (
            <li key={e.id} className="border-b themed-border pb-4">
              <button
                type="button"
                onClick={() => openModal(e)}
                className="text-xl font-medium themed-link text-left hover:opacity-70 transition-opacity"
              >
                {e.title}
              </button>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
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
                <Link
                  href={`/${e.publisherSlug}`}
                  className="text-xs themed-muted hover:underline"
                >
                  @{e.publisherSlug}
                </Link>
              </div>
            </li>
          ))}
        </ul>
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
            {/* Header — fixed, never scrolls */}
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
    </>
  )
}
