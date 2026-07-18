"use client";

import { useState } from "react";

export interface AddMenuItem {
  key: string;
  /** Toolbar button label. */
  label: string;
  /** The form (with its bound server action) to disclose when selected. */
  content: React.ReactNode;
}

/**
 * Compact "Add" toolbar for the curriculum editor: one row of type buttons
 * that discloses a single add-form at a time, instead of a permanent wall of
 * five stacked forms. New entries append to the end of the list; the author
 * drags them into place (drag-and-drop is instant). Selecting the active type
 * again collapses the panel.
 */
export default function AddCurriculumMenu({ items }: { items: AddMenuItem[] }) {
  const [active, setActive] = useState<string | null>(null);
  const activeItem = items.find((i) => i.key === active) ?? null;
  const panelId = "add-curriculum-panel";

  return (
    <div className="mt-8 border-t themed-border pt-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="ps-mono-micro themed-muted mr-1">Add</span>
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActive(isActive ? null : item.key)}
              aria-expanded={isActive}
              aria-controls={isActive ? panelId : undefined}
              className="rounded-lg text-xs px-3 py-1.5 border transition-colors"
              style={
                isActive
                  ? {
                      borderColor: "var(--accent)",
                      background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                      color: "var(--accent)",
                    }
                  : { borderColor: "var(--border)", color: "var(--secondary-text)" }
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {activeItem && (
        <div
          id={panelId}
          className="mt-4 rounded-lg border themed-border p-4"
          style={{ background: "var(--surface)" }}
        >
          {activeItem.content}
        </div>
      )}
    </div>
  );
}
