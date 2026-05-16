"use client";

import { useState, useRef } from "react";

type ImageItem = {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
};

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
  });
}

function filename(pathname: string): string {
  const parts = pathname.split("/");
  return parts[parts.length - 1];
}

export default function ImageManager({ publisherSlug, initialImages }: Props) {
  const [images, setImages] = useState<ImageItem[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [altText, setAltText] = useState("");
  const [lastSnippet, setLastSnippet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLastSnippet(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (!altText.trim()) {
      setError("Alt text is required.");
      return;
    }

    setUploading(true);
    const fd = new FormData();
    fd.append("publisher", publisherSlug);
    fd.append("file", file);

    const res = await fetch("/api/images/upload", { method: "POST", body: fd });
    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? "Upload failed.");
      return;
    }

    const data = (await res.json()) as { url: string; pathname: string };
    const snippet = `![${altText}](${data.url})`;
    setLastSnippet(snippet);
    setAltText("");
    if (fileRef.current) fileRef.current.value = "";

    // Prepend to the image list
    setImages((prev) => [
      {
        url: data.url,
        pathname: data.pathname,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
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
        <form onSubmit={handleUpload} className="space-y-3">
          <div>
            <label
              htmlFor="img-file"
              className="block text-sm font-medium themed-secondary mb-1"
            >
              File
            </label>
            <input
              id="img-file"
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              required
              className="themed-input w-full"
            />
          </div>
          <div>
            <label
              htmlFor="img-alt"
              className="block text-sm font-medium themed-secondary mb-1"
            >
              Alt text <span className="text-red-500">*</span>
            </label>
            <input
              id="img-alt"
              type="text"
              required
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Descriptive text for screen readers"
              className="themed-input w-full"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={uploading || !altText.trim()}
            className="themed-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>

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
          <p className="themed-muted text-sm">
            No images yet. Upload one above to get started.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img) => {
              const name = filename(img.pathname);
              return (
                <div
                  key={img.pathname}
                  className="themed-surface rounded-lg overflow-hidden border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="w-full h-40 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={name}
                      className="max-h-40 max-w-full object-cover"
                    />
                  </div>
                  {/* Meta */}
                  <div className="p-3 space-y-1">
                    <p
                      className="text-xs font-medium themed-secondary truncate"
                      title={name}
                    >
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
