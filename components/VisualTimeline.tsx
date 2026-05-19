import Link from "next/link"
import { deriveEras, categoryColor } from "@/lib/timeline-utils"
import type { EventRow } from "@/lib/timeline-utils"

export default function VisualTimeline({ rows }: { rows: EventRow[] }) {
  const eras = deriveEras(rows)
  const sorted = [...rows].sort(
    (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  )
  const renderedEraStarts = new Set<string>()

  return (
    <div className="relative w-full px-4 py-6">
      <div className="absolute left-[7px] top-0 bottom-0 w-0.5 bg-[var(--border)]" />
      <div className="space-y-6">
        {sorted.map((e) => {
          const year = new Date(e.eventDate).getFullYear()
          const newEras = eras.filter(
            (era) => era.startYear === year && !renderedEraStarts.has(era.name)
          )
          newEras.forEach((era) => renderedEraStarts.add(era.name))
          return (
            <div key={e.id}>
              {newEras.map((era) => (
                <div key={era.name} className="relative flex items-center mb-4 ml-6">
                  <span className="text-xs font-semibold uppercase tracking-widest themed-muted pr-3 bg-[var(--background)]">
                    {era.name}
                  </span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>
              ))}
              <div className="relative flex items-start gap-4">
                <div
                  className="relative z-10 mt-1 w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-[var(--background)]"
                  style={{ backgroundColor: categoryColor(e.category) }}
                />
                <div className="flex-1 themed-card p-3 -mt-0.5">
                  <Link
                    href={e.publisherSlug ? `/${e.publisherSlug}/events/${e.slug}` : "#"}
                    className="text-sm font-medium themed-link"
                  >
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
                    {e.publisherSlug && (
                      <Link href={`/${e.publisherSlug}`} className="text-xs themed-muted hover:underline">
                        @{e.publisherSlug}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
