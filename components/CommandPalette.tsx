"use client";

import { useEffect, useRef, useState, useCallback, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { searchAll } from "@/lib/search";
import { getPageCommands, filterPageCommands } from "@/lib/page-commands";

type SearchResult = Awaited<ReturnType<typeof searchAll>>;

/**
 * Site-wide command palette opened with Ctrl/Cmd+Shift+P.
 * Searches articles, books, and objects, plus static page destinations
 * (settings, search, timeline, ...); navigates on selection.
 */
export default function CommandPalette({ userSlug = null }: { userSlug?: string | null }) {
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

  const pageCommands = useMemo(() => getPageCommands(userSlug), [userSlug]);

  if (!open) return null;

  const matchedPages = filterPageCommands(pageCommands, query);
  const totalResults =
    results.articles.length + results.books.length + results.objects.length + matchedPages.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={closePalette}
      aria-modal="true"
      role="dialog"
      aria-label="Command palette"
    >
      <div className="absolute inset-0 themed-backdrop" aria-hidden="true" />
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

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim() && totalResults === 0 && !isPending ? (
            <p className="px-4 py-6 text-sm text-center themed-muted">
              No results for &quot;{query}&quot;
            </p>
          ) : (
            <div className="py-2">
              {matchedPages.length > 0 && (
                <ResultGroup label="Pages">
                  {matchedPages.map((p) => (
                    <ResultItem
                      key={p.href}
                      icon={p.section === "Settings" ? "settings" : "page"}
                      label={p.label}
                      sublabel={p.href}
                      onClick={() => navigate(p.href)}
                    />
                  ))}
                </ResultGroup>
              )}
              {query.trim() && (
                <>
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
                </>
              )}
            </div>
          )}
        </div>

        {!query.trim() && (
          <div className="px-4 py-3 text-xs themed-muted flex items-center gap-4 border-t themed-border">
            <span>Type to search articles, books, and objects</span>
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
  icon: "article" | "book" | "animation" | "page" | "settings";
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
        {icon === "page" && (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        )}
        {icon === "settings" && (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
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
