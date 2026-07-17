"use client";

import { useState } from "react";
import type { CitationInput } from "@/lib/citations";
import { formatAPA, formatMLA, formatChicago, formatBibTeX } from "@/lib/citations";

type Tab = "apa" | "mla" | "chicago" | "bibtex";

type Props = Omit<CitationInput, "accessedAt"> & {
  onClose: () => void;
};

export default function CitationModal({ onClose, ...inputProps }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("apa");
  const [copied, setCopied] = useState(false);

  const accessedAt = new Date();
  const input: CitationInput = { ...inputProps, accessedAt };

  const citations: Record<Tab, string> = {
    apa: formatAPA(input),
    mla: formatMLA(input),
    chicago: formatChicago(input),
    bibtex: formatBibTeX(input),
  };

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(citations[activeTab]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "apa", label: "APA" },
    { id: "mla", label: "MLA" },
    { id: "chicago", label: "Chicago" },
    { id: "bibtex", label: "BibTeX" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center themed-backdrop p-4"
      onClick={handleBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cite this article"
        className="themed-surface border themed-border rounded-lg shadow-xl w-full max-w-lg"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b themed-border">
          <h2 className="text-base font-semibold themed-heading">Cite this article</h2>
          <button
            type="button"
            onClick={onClose}
            className="themed-muted hover:themed-heading transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b themed-border px-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 mr-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-current themed-heading"
                  : "border-transparent themed-muted hover:themed-heading"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Citation text */}
        <div className="px-5 py-4">
          <pre className="text-xs themed-muted whitespace-pre-wrap break-all themed-pre select-all">
            {citations[activeTab]}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-5 pb-4">
          <button type="button" onClick={onClose} className="themed-btn-ghost text-sm px-4 py-2">
            Close
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="themed-btn-accent rounded-lg text-sm px-4 py-2"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
