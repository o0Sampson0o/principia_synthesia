"use client";

import { useState } from "react";
import ImageUploader, { type UploadedImage } from "@/components/ImageUploader";

type ImageItem = UploadedImage;

type Props = {
  publisherSlug: string;
  initialImages: ImageItem[];
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function filename(pathname: string): string {
  const parts = pathname.split("/");
  return parts[parts.length - 1];
}

export default function ImageManager({ publisherSlug, initialImages }: Props) {
  const [images, setImages] = useState<ImageItem[]>(initialImages);
  const [altText, setAltText] = useState("");
  const [lastSnippet, setLastSnippet] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function handleUploaded(image: UploadedImage) {
    setImages((prev) => [image, ...prev]);
    if (altText.trim()) {
      setLastSnippet(`![${altText}](/${image.pathname})`);
      setAltText("");
    }
  }

  async function handleDelete(item: ImageItem) {
    if (!confirm(`Delete ${filename(item.pathname)}? This cannot be undone.`)) return;
    const res = await fetch(`/api/images/${item.pathname}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      alert("Delete failed. Please try again.");
      return;
    }
    setImages((prev) => prev.filter((i) => i.pathname !== item.pathname));
  }

  async function copyToClipboard(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-10">
      {/* Upload section */}
      <section className="themed-surface rounded-lg p-6">
        <h2 className="text-lg font-semibold themed-heading mb-4">Upload image</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium themed-secondary mb-1">
              Alt text <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Descriptive text for screen readers"
              className="themed-input w-full"
            />
            <p className="text-xs themed-muted mt-1">
              Enter alt text first, then choose a file to upload.
            </p>
          </div>

          <ImageUploader publisherSlug={publisherSlug} onUploaded={handleUploaded} />
        </div>

        {lastSnippet && (
          <div className="mt-4">
            <p className="text-sm themed-muted mb-1">Markdown snippet:</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={lastSnippet}
                className="themed-input font-mono text-sm flex-1"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(lastSnippet, "snippet")}
                className="themed-btn-ghost text-sm px-3 py-1"
              >
                {copied === "snippet" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Gallery */}
      <section>
        <h2 className="text-lg font-semibold themed-heading mb-4">Gallery</h2>
        {images.length === 0 ? (
          <p className="themed-muted text-sm">No images yet. Upload one above to get started.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img) => {
              const name = filename(img.pathname);
              return (
                <div
                  key={img.pathname}
                  className="themed-surface rounded-lg overflow-hidden border border-transparent themed-hover-border transition-colors"
                >
                  <div className="w-full h-40 themed-muted-bg flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={name} className="max-h-40 max-w-full object-cover" />
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-xs font-medium themed-secondary truncate" title={name}>
                      {name}
                    </p>
                    <p className="text-xs themed-muted">{formatDate(img.uploadedAt)}</p>
                    <p className="text-xs themed-muted">{formatBytes(img.size)}</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(img.url, img.pathname)}
                        className="themed-btn-ghost text-xs px-2 py-1"
                      >
                        {copied === img.pathname ? "Copied!" : "Copy URL"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(img)}
                        className="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
