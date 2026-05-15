"use client";

import { useState, useCallback } from "react";
import { parseFrontmatter, serializeFrontmatter } from "@/lib/frontmatter";
import { ARTICLE_STATUSES } from "@/lib/validations";
import type { ArticleMetadata } from "@/lib/validations";

interface Props {
  /** Current MDX content (with or without a frontmatter block). */
  initialContent: string;
  /** KAO animation objects available for selection as the canvas animation. */
  availableCanvasSlugs: { slug: string; name: string }[];
}

/**
 * Editor panel for the four frontmatter fields (status, tags, description, canvas).
 *
 * On any change, reads the current value of the hidden #content-field input,
 * strips its frontmatter, and prepends a freshly serialized YAML block —
 * matching the same pattern as SectionReorderPanel.
 *
 * Important caveats:
 * - CodeMirror is uncontrolled; changes made here will not appear in the visible
 *   editor until the page is reloaded. The hidden #content-field is what gets
 *   submitted to the server action, so saves are always correct.
 * - If the user edits the YAML block directly in CodeMirror AND in this panel,
 *   the last write wins. Body text below the --- block is always preserved.
 */
export default function FrontmatterEditor({ initialContent, availableCanvasSlugs }: Props) {
  const { metadata: initialMeta } = parseFrontmatter(initialContent);

  const [formState, setFormState] = useState<ArticleMetadata>(initialMeta);
  const [tagsInput, setTagsInput] = useState(initialMeta.tags.join(", "));

  const updateHiddenField = useCallback((newMeta: ArticleMetadata) => {
    const field = document.getElementById("content-field") as HTMLInputElement | null;
    const current = field?.value ?? initialContent;
    const { body } = parseFrontmatter(current);
    const next = serializeFrontmatter(newMeta, body);
    if (field) field.value = next;
  }, [initialContent]);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = { ...formState, status: e.target.value as ArticleMetadata["status"] };
    setFormState(next);
    updateHiddenField(next);
  };

  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTagsInput(e.target.value);
    const tags = e.target.value
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const next = { ...formState, tags };
    setFormState(next);
    updateHiddenField(next);
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = { ...formState, description: e.target.value };
    setFormState(next);
    updateHiddenField(next);
  };

  const handleCanvasChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const next = { ...formState, canvas: value === "" ? null : value };
    setFormState(next);
    updateHiddenField(next);
  };

  const descLength = formState.description.length;
  const descColor =
    descLength >= 300
      ? "text-red-500"
      : descLength >= 250
      ? "text-amber-500"
      : "text-zinc-400 dark:text-zinc-500";

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        This panel rewrites the frontmatter block at the top of the MDX. Edits made directly
        in the editor below the <code>---</code> block are preserved; edits to the YAML block
        in the code editor may be overwritten when you change fields here. Changes are not
        reflected in the visible code editor until the page reloads — the hidden content
        field is what gets submitted.
      </p>

      {/* Status */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Status
        </label>
        <select
          value={formState.status}
          onChange={handleStatusChange}
          className="themed-input text-sm"
        >
          {ARTICLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Tags */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Tags <span className="font-normal text-zinc-400">(comma-separated, lowercase)</span>
        </label>
        <input
          type="text"
          value={tagsInput}
          onChange={handleTagsChange}
          placeholder="physics, mechanics, thermodynamics"
          className="themed-input text-sm"
        />
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Description <span className="font-normal text-zinc-400">(max 300 chars)</span>
        </label>
        <textarea
          value={formState.description}
          onChange={handleDescriptionChange}
          rows={3}
          maxLength={300}
          placeholder="Short author-controlled description shown on the article page."
          className="themed-input text-sm resize-none w-full"
        />
        <p className={`text-xs ${descColor}`}>{descLength} / 300</p>
      </div>

      {/* Canvas */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Canvas animation <span className="font-normal text-zinc-400">(auto-embeds at article top)</span>
        </label>
        <select
          value={formState.canvas ?? ""}
          onChange={handleCanvasChange}
          className="themed-input text-sm"
        >
          <option value="">— none —</option>
          {availableCanvasSlugs.map((obj) => (
            <option key={obj.slug} value={obj.slug}>
              {obj.name} ({obj.slug})
            </option>
          ))}
        </select>
        {availableCanvasSlugs.length === 0 && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            No animation objects found. Create one at{" "}
            <a href="/admin/objects/new" className="underline">
              /admin/objects/new
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
