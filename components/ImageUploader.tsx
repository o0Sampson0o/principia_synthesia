"use client";

import { useState, useRef } from "react";

export type UploadedImage = {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
};

type Props = {
  publisherSlug: string;
  onUploaded: (image: UploadedImage) => void;
};

export default function ImageUploader({ publisherSlug, onUploaded }: Props) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPendingFile(file);
    setCustomName(file.name.replace(/\.[^.]+$/, ""));
  }

  function clearFile() {
    setPendingFile(null);
    setCustomName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setError(null);
    setUploading(true);

    const fd = new FormData();
    fd.append("publisher", publisherSlug);
    fd.append("file", pendingFile);
    if (customName.trim()) fd.append("name", customName.trim());

    const res = await fetch("/api/images/upload", { method: "POST", body: fd });
    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? "Upload failed.");
      return;
    }

    const data = (await res.json()) as { url: string; pathname: string };
    onUploaded({
      url: data.url,
      pathname: data.pathname,
      size: pendingFile.size,
      uploadedAt: new Date().toISOString(),
    });
    clearFile();
  }

  return (
    <div className="space-y-2">
      {/* Hidden — triggered programmatically to avoid click-zone collisions */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFilePick}
        disabled={uploading}
        className="hidden"
      />

      {!pendingFile ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="themed-btn-ghost text-sm px-3 py-1"
        >
          Choose file…
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm themed-muted">
            <span className="truncate max-w-xs">{pendingFile.name}</span>
            <button
              type="button"
              onClick={clearFile}
              className="text-xs themed-btn-ghost px-2 py-0.5 shrink-0"
            >
              Change
            </button>
          </div>

          <div>
            <label className="block text-xs themed-muted mb-1">
              Save as (without extension)
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="my-image-name"
              className="themed-input text-sm w-full"
            />
            <p className="text-xs themed-muted mt-1">
              Special characters will be removed automatically.
            </p>
          </div>

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="themed-btn-accent rounded-lg text-sm"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
