"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchAll } from "@/lib/search";

type SearchResult = Awaited<ReturnType<typeof searchAll>>;

/**
 * Site-wide command palette opened with Ctrl/Cmd+Shift+P.
 * Searches articles, books, and objects; navigates to publisher-scoped URLs.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult>({ articles: [], books: [], objects: [] });
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  const router = useRouter();

  const openPalette = useCallback(() => {
    setQuery("");
    setResults({ articles: [], books: [], objects: [] });
    setOpen(true);
    openRef.current = true;
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    openRef.current = false;
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        e.stopPropagation();
        if (openRef.current) closePalette(); else openPalette();
      }
      if (e.key === "Escape") closePalette();
    }
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [openPalette, closePalette]);

  const handleInput = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults({ articles: [], books: [], objects: [] });
      return;
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchAll(value);
        setResults(res);
      });
    }, 200);
  }, []);

  function navigate(href: string) {
    closePalette();
    router.push(href);
  }

  if (!open) return null;

  const totalResults = results.articles.length + results.books.length + results.objects.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={closePalette}
      aria-modal="true"
      role="dialog"
      aria-label="Command palette"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative w-full max-w-xl mx-4 rounded-xl shadow-2xl overflow-hidden themed-surface border themed-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b themed-border">
          <svg className="w-4 h-4 themed-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-sm themed-heading placeholder:themed-muted"
            placeholder="Search articles, books, objects..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {isPending && <span className="text-xs themed-muted">Searching...</span>}
          <kbd className="text-xs themed-muted border themed-border rounded px-1.5 py-0.5 font-mono">Esc</kbd>
        </div>

        {query.trim() && (
          <div className="max-h-[60vh] overflow-y-auto">
            {totalResults === 0 && !isPending ? (
              <p className="px-4 py-6 text-sm text-center themed-muted">
                No results for &quot;{query}&quot;
              </p>
            ) : (
              <div className="py-2">
                {results.articles.length > 0 && (
                  <ResultGroup label="Articles">
                    {results.articles.map((a) => (
                      <ResultItem
                        key={a.id}
                        icon="article"
                        label={a.title}
                        sublabel={`@${a.publisherSlug}`}
                        onClick={() => navigate(`/${a.publisherSlug}/articles/${a.slug}`)}
                      />
                    ))}
                  </ResultGroup>
                )}
                {results.books.length > 0 && (
                  <ResultGroup label="Books">
                    {results.books.map((b) => (
                      <ResultItem
                        key={b.id}
                        icon="book"
                        label={b.title}
                        sublabel={`@${b.publisherSlug}`}
                        onClick={() => navigate(`/${b.publisherSlug}/books/${b.slug}`)}
                      />
                    ))}
                  </ResultGroup>
                )}
                {results.objects.length > 0 && (
                  <ResultGroup label="Objects">
                    {results.objects.map((o) => (
                      <ResultItem
                        key={o.id}
                        icon="animation"
                        label={o.name}
                        sublabel={`@${o.publisherSlug} · ${o.type}`}
                        onClick={() => navigate(`/${o.publisherSlug}/objects/${o.slug}`)}
                      />
                    ))}
                  </ResultGroup>
                )}
              </div>
            )}
          </div>
        )}

        {!query.trim() && (
          <div className="px-4 py-3 text-xs themed-muted flex items-center gap-4">
            <span>Type to search</span>
            <span className="ml-auto">
              <kbd className="border themed-border rounded px-1 py-0.5 font-mono">Ctrl</kbd>{" "}
              <kbd className="border themed-border rounded px-1 py-0.5 font-mono">Shift</kbd>{" "}
              <kbd className="border themed-border rounded px-1 py-0.5 font-mono">P</kbd>{" "}
              to toggle
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-4 py-1 text-xs font-semibold uppercase tracking-widest themed-muted">{label}</p>
      {children}
    </div>
  );
}

function ResultItem({
  icon,
  label,
  sublabel,
  onClick,
}: {
  icon: "article" | "book" | "animation";
  label: string;
  sublabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left themed-heading hover:themed-surface-hover transition-colors"
      onClick={onClick}
    >
      <span className="w-5 h-5 shrink-0 themed-muted" aria-hidden="true">
        {icon === "article" && (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
          </svg>
        )}
        {icon === "book" && (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        )}
        {icon === "animation" && (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 0 1 0 1.971l-11.54 6.347a1.125 1.125 0 0 1-1.667-.985V5.653z" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {sublabel && <span className="block text-xs themed-muted truncate">{sublabel}</span>}
      </span>
    </button>
  );
}
