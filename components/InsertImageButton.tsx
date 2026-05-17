"use client";

import { useState } from "react";
import type { RefObject } from "react";
import type { ContentEditorRef } from "./ContentEditor";
import ImageUploader, { type UploadedImage } from "./ImageUploader";

type ImageItem = {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
};

type Props = {
  publisherSlug: string;
  /** Ref to a ContentEditor — preferred insertion method. */
  editorRef?: RefObject<ContentEditorRef | null>;
  /** Fallback: ID of the <textarea> to insert the markdown snippet into. */
  targetTextareaId?: string;
};

function filename(pathname: string): string {
  const parts = pathname.split("/");
  return parts[parts.length - 1];
}

/** Inserts `text` at the cursor position of a plain HTMLTextAreaElement. */
function insertAtCursor(textarea: HTMLTextAreaElement, text: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  textarea.value = value.slice(0, start) + text + value.slice(end);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}

export default function InsertImageButton({
  publisherSlug,
  editorRef,
  targetTextareaId = "content",
}: Props) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<ImageItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ url: string; pathname: string } | null>(null);
  const [altText, setAltText] = useState("");

  async function openModal() {
    setOpen(true);
    setSelected(null);
    setAltText("");
    if (images === null) await fetchImages();
  }

  async function fetchImages() {
    setLoading(true);
    try {
      const res = await fetch(`/api/images/list?publisher=${encodeURIComponent(publisherSlug)}`);
      if (res.ok) {
        const data = (await res.json()) as { images: ImageItem[] };
        setImages(data.images);
      } else {
        setImages([]);
      }
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
  }

  function handleUploaded(image: UploadedImage) {
    setImages((prev) => (prev ? [image, ...prev] : [image]));
    setSelected({ url: image.url, pathname: image.pathname });
  }

  function handleInsert() {
    if (!selected) return;
    const src = `/${selected.pathname}`;
    const snippet = `![${altText}](${src})`;
    if (editorRef?.current) {
      editorRef.current.insertText(snippet);
    } else {
      const textarea = document.getElementById(targetTextareaId) as HTMLTextAreaElement | null;
      if (textarea) insertAtCursor(textarea, snippet);
    }
    setOpen(false);
    setSelected(null);
    setAltText("");
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="themed-btn-ghost text-sm px-3 py-1"
        title="Insert image"
      >
        Insert image
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Insert image"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="themed-surface rounded-lg shadow-xl w-full max-w-2xl mx-4 p-6 space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold themed-heading">Insert image</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="themed-btn-ghost text-sm px-2 py-1"
              >
                Close
              </button>
            </div>

            {/* Upload */}
            <div>
              <p className="text-sm font-medium themed-secondary mb-2">Upload image</p>
              <ImageUploader publisherSlug={publisherSlug} onUploaded={handleUploaded} />
            </div>

            {/* Gallery */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="text-sm themed-muted">Loading images…</p>
              ) : images && images.length === 0 ? (
                <p className="text-sm themed-muted">No images yet. Upload one above.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {(images ?? []).map((img) => (
                    <button
                      key={img.pathname}
                      type="button"
                      onClick={() => setSelected({ url: img.url, pathname: img.pathname })}
                      className={[
                        "rounded-md overflow-hidden border-2 text-left transition-colors",
                        selected?.pathname === img.pathname
                          ? "border-blue-500"
                          : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-600",
                      ].join(" ")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={filename(img.pathname)}
                        className="w-full h-24 object-cover"
                      />
                      <span className="block text-xs themed-muted px-1 py-1 truncate">
                        {filename(img.pathname)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Alt text + insert */}
            {selected && (
              <div className="space-y-2 border-t themed-border pt-4">
                <p className="text-sm themed-muted">
                  Selected:{" "}
                  <span className="font-mono text-xs">{filename(selected.pathname)}</span>
                </p>
                <label htmlFor="insert-alt" className="block text-sm font-medium themed-secondary">
                  Alt text
                </label>
                <input
                  id="insert-alt"
                  type="text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="Describe the image"
                  className="themed-input w-full text-sm"
                />
                <button type="button" onClick={handleInsert} className="themed-btn-primary text-sm">
                  Insert
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
