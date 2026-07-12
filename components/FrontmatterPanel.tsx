"use client";

import { useState, forwardRef, useImperativeHandle, type RefObject } from "react";
import type { ContentEditorRef } from "./ContentEditor";
import type { ArticleMetadata } from "@/lib/validations";

export interface FrontmatterPanelRef {
  syncFromMdx: (mdx: string) => void;
}

const STATUSES = ["published", "draft", "review", "archived"] as const;

function parseFrontmatterClient(mdx: string): { metadata: ArticleMetadata; body: string } {
  const defaults: ArticleMetadata = { status: "published", tags: [], description: "", canvas: null };
  if (!mdx.startsWith("---")) return { metadata: defaults, body: mdx };
  const end = mdx.indexOf("\n---", 3);
  if (end === -1) return { metadata: defaults, body: mdx };
  const yamlBlock = mdx.slice(3, end).trim();
  const body = mdx.slice(end + 4).trimStart();
  const meta: Partial<ArticleMetadata> = {};
  for (const line of yamlBlock.split("\n")) {
    const [key, ...rest] = line.split(":");
    const val = rest.join(":").trim();
    if (key?.trim() === "status" && STATUSES.includes(val as ArticleMetadata["status"])) {
      meta.status = val as ArticleMetadata["status"];
    } else if (key?.trim() === "tags") {
      try { meta.tags = JSON.parse(val); } catch { meta.tags = []; }
    } else if (key?.trim() === "description") {
      try { meta.description = JSON.parse(val); } catch { meta.description = val; }
    } else if (key?.trim() === "canvas") {
      meta.canvas = val === "null" ? null : val || null;
    }
  }
  return { metadata: { ...defaults, ...meta }, body };
}

function serializeFrontmatterBlock(metadata: ArticleMetadata): string {
  const tags = JSON.stringify(metadata.tags.map((t) => t.toLowerCase()));
  const desc = JSON.stringify(metadata.description);
  const canvas = metadata.canvas === null ? "null" : metadata.canvas;
  return `---\nstatus: ${metadata.status}\ntags: ${tags}\ndescription: ${desc}\ncanvas: ${canvas}\n---`;
}

export default forwardRef<FrontmatterPanelRef, {
  editorRef: RefObject<ContentEditorRef | null>;
  initialMetadata: ArticleMetadata;
}>(function FrontmatterPanel({ editorRef, initialMetadata }, ref) {
  const [meta, setMeta] = useState<ArticleMetadata>(initialMetadata);

  useImperativeHandle(ref, () => ({
    syncFromMdx(mdx: string) {
      const { metadata: parsed } = parseFrontmatterClient(mdx);
      setMeta(prev => {
        if (
          prev.status === parsed.status &&
          prev.description === parsed.description &&
          prev.canvas === parsed.canvas &&
          JSON.stringify(prev.tags) === JSON.stringify(parsed.tags)
        ) return prev;
        return parsed;
      });
    },
  }));

  function applyChange(next: ArticleMetadata) {
    setMeta(next);
    // Replace only the frontmatter block — the body (and the author's cursor,
    // scroll, and live-preview state) stays untouched.
    editorRef.current?.replaceFrontmatter(serializeFrontmatterBlock(next));
  }

  return (
    <details data-tour="frontmatter-panel" className="border rounded themed-surface">
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium themed-secondary select-none">
        Frontmatter
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

        {/* Description */}
        <div className="flex items-start gap-3">
          <label className="w-24 text-sm themed-secondary shrink-0 pt-1">Description</label>
          <textarea
            value={meta.description}
            onChange={(e) => applyChange({ ...meta, description: e.target.value })}
            rows={2}
            maxLength={300}
            placeholder="Short summary (max 300 chars)"
            className="themed-input text-sm flex-1 resize-y"
          />
        </div>

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
