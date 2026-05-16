"use client";

import { useState, useRef } from "react";
import type { RefObject } from "react";
import type { ContentEditorRef } from "./ContentEditor";

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
  // Fire an input event so any React controlled-value handler picks it up
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
  const [uploading, setUploading] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function openModal() {
    setOpen(true);
    setSelectedUrl(null);
    setAltText("");
    setUploadError(null);
    if (images === null) {
      await fetchImages();
    }
  }

  async function fetchImages() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/images/list?publisher=${encodeURIComponent(publisherSlug)}`
      );
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

  async function handleQuickUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);

    const fd = new FormData();
    fd.append("publisher", publisherSlug);
    fd.append("file", file);

    const res = await fetch("/api/images/upload", { method: "POST", body: fd });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setUploadError((body as { error?: string }).error ?? "Upload failed.");
      return;
    }

    const data = (await res.json()) as { url: string; pathname: string };
    const newItem: ImageItem = {
      url: data.url,
      pathname: data.pathname,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
    setImages((prev) => (prev ? [newItem, ...prev] : [newItem]));
    setSelectedUrl(data.url);
  }

  function handleInsert() {
    if (!selectedUrl) return;
    const snippet = `![${altText}](${selectedUrl})`;
    if (editorRef?.current) {
      editorRef.current.insertText(snippet);
    } else {
      const textarea = document.getElementById(
        targetTextareaId
      ) as HTMLTextAreaElement | null;
      if (textarea) insertAtCursor(textarea, snippet);
    }
    setOpen(false);
    setSelectedUrl(null);
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
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

            {/* Quick upload */}
            <div>
              <label className="block text-sm font-medium themed-secondary mb-1">
                Quick upload
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleQuickUpload}
                disabled={uploading}
                className="themed-input text-sm"
              />
              {uploading && (
                <p className="text-xs themed-muted mt-1">Uploading…</p>
              )}
              {uploadError && (
                <p className="text-xs text-red-500 mt-1">{uploadError}</p>
              )}
            </div>

            {/* Gallery */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="text-sm themed-muted">Loading images…</p>
              ) : images && images.length === 0 ? (
                <p className="text-sm themed-muted">
                  No images yet. Upload one above.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {(images ?? []).map((img) => (
                    <button
                      key={img.pathname}
                      type="button"
                      onClick={() => setSelectedUrl(img.url)}
                      className={[
                        "rounded-md overflow-hidden border-2 text-left transition-colors",
                        selectedUrl === img.url
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
                      <p className="text-xs themed-muted px-1 py-1 truncate">
                        {filename(img.pathname)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Alt text + insert */}
            {selectedUrl && (
              <div className="space-y-2 border-t themed-border pt-4">
                <p className="text-sm themed-muted">
                  Selected:{" "}
                  <span className="font-mono text-xs">
                    {filename(selectedUrl.split("?")[0])}
                  </span>
                </p>
                <label
                  htmlFor="insert-alt"
                  className="block text-sm font-medium themed-secondary"
                >
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
                <button
                  type="button"
                  onClick={handleInsert}
                  className="themed-btn-primary text-sm"
                >
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
