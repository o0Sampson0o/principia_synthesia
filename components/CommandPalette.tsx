"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchAll } from "@/app/admin/actions";

type SearchResult = Awaited<ReturnType<typeof searchAll>>;

/**
 * Site-wide command palette opened with Ctrl/Cmd+Shift+P.
 *
 * Renders a modal overlay with a search input that fuzzy-searches articles,
 * books, and animations on each keystroke (debounced ~200 ms). Results are
 * grouped by type; clicking a result navigates to it via `useRouter().push()`.
 * Closes on Escape or backdrop click.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult>({ articles: [], books: [], animations: [] });
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Global keydown listener for Ctrl/Cmd+Shift+P
  // Uses capture phase + stopImmediatePropagation to prevent browser
  // (e.g. Edge) from intercepting the shortcut for its own print dialog.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  // Focus input when palette opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults({ articles: [], books: [], animations: [] });
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Debounced search
  const handleInput = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults({ articles: [], books: [], animations: [] });
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
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  const totalResults =
    results.articles.length + results.books.length + results.animations.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
      aria-modal="true"
      role="dialog"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl mx-4 rounded-xl shadow-2xl overflow-hidden themed-surface border themed-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b themed-border">
          <svg
            className="w-4 h-4 themed-muted shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-sm themed-heading placeholder:themed-muted"
            placeholder="Search articles, books, animations..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {isPending && (
            <span className="text-xs themed-muted">Searching...</span>
          )}
          <kbd className="text-xs themed-muted border themed-border rounded px-1.5 py-0.5 font-mono">
            Esc
          </kbd>
        </div>

        {/* Results */}
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
                        onClick={() => navigate(`/${a.slug}`)}
                      />
                    ))}
                  </ResultGroup>
                )}
                {results.books.length > 0 && (
                  <ResultGroup label="Books">
                    {results.books.map((b) => (
                      <ResultItem
                        key={b.bookSlug}
                        icon="book"
                        label={b.bookTitle}
                        onClick={() => navigate(`/curriculum/${b.bookSlug}`)}
                      />
                    ))}
                  </ResultGroup>
                )}
                {results.animations.length > 0 && (
                  <ResultGroup label="Animations">
                    {results.animations.map((a) => (
                      <ResultItem
                        key={a.slug}
                        icon="animation"
                        label={a.name}
                        onClick={() => navigate(`/animations/${a.slug}`)}
                      />
                    ))}
                  </ResultGroup>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer hint */}
        {!query.trim() && (
          <div className="px-4 py-3 text-xs themed-muted flex items-center gap-4">
            <span>Type to search</span>
            <span className="ml-auto">
              <kbd className="border themed-border rounded px-1 py-0.5 font-mono">Ctrl</kbd>
              {" "}<kbd className="border themed-border rounded px-1 py-0.5 font-mono">Shift</kbd>
              {" "}<kbd className="border themed-border rounded px-1 py-0.5 font-mono">P</kbd>
              {" "}to toggle
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
      <p className="px-4 py-1 text-xs font-semibold uppercase tracking-widest themed-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function ResultItem({
  icon,
  label,
  onClick,
}: {
  icon: "article" | "book" | "animation";
  label: string;
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
      {label}
    </button>
  );
}
