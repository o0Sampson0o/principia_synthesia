"use client";

import { useState, forwardRef, useImperativeHandle } from "react";
import type { ArticleMetadata } from "@/lib/validations";
import { parseFrontmatterClient } from "@/lib/frontmatter-client";

export interface FrontmatterPanelRef {
  /** Set the panel's fields from a full content string (used on draft restore). */
  syncFromMdx: (mdx: string) => void;
}

const STATUSES = ["published", "draft", "review", "archived"] as const;

export default forwardRef<FrontmatterPanelRef, {
  initialMetadata: ArticleMetadata;
  /** Notified whenever a field changes (the parent owns the recombined content). */
  onChange?: (metadata: ArticleMetadata) => void;
}>(function FrontmatterPanel({ initialMetadata, onChange }, ref) {
  const [meta, setMeta] = useState<ArticleMetadata>(initialMetadata);

  useImperativeHandle(ref, () => ({
    syncFromMdx(mdx: string) {
      const { metadata: parsed } = parseFrontmatterClient(mdx);
      setMeta((prev) => {
        if (
          prev.status === parsed.status &&
          prev.description === parsed.description &&
          prev.canvas === parsed.canvas &&
          JSON.stringify(prev.tags) === JSON.stringify(parsed.tags)
        ) {
          return prev;
        }
        return parsed;
      });
    },
  }));

  function applyChange(next: ArticleMetadata) {
    setMeta(next);
    onChange?.(next);
  }

  return (
    <details data-tour="frontmatter-panel" className="border themed-border rounded-lg themed-surface">
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium themed-secondary select-none">
        Status &amp; advanced
      </summary>
      <div className="px-4 py-3 space-y-3 border-t themed-border">
        {/* Status */}
        <div className="flex items-center gap-3">
          <label className="w-24 text-sm themed-secondary shrink-0">Status</label>
          <select
            value={meta.status}
            onChange={(e) => applyChange({ ...meta, status: e.target.value as ArticleMetadata["status"] })}
            className="themed-input text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* No Description field: it duplicated Summary (and the page once
            showed both). A stored description is kept in the frontmatter and
            still shown on an article that has no summary. */}

        {/* Canvas */}
        <div className="flex items-center gap-3">
          <label className="w-24 text-sm themed-secondary shrink-0">Canvas</label>
          <input
            type="text"
            value={meta.canvas ?? ""}
            onChange={(e) => applyChange({ ...meta, canvas: e.target.value.trim() || null })}
            placeholder="anim-slug (optional)"
            className="themed-input text-sm flex-1"
          />
        </div>
      </div>
    </details>
  );
});
