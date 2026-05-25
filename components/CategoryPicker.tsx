"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Category = {
  id: number;
  slug: string;
  name: string;
  bookmarked: boolean;
};

export default function CategoryPicker({
  initialSelected = [],
}: {
  initialSelected?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [defaults, setDefaults] = useState<Category[]>([]);
  const [searchResults, setSearchResults] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/categories/search?mode=default")
      .then((r) => r.json())
      .then((d) => setDefaults(d.categories ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setSearchResults([]);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const search = useCallback((q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    fetch(`/api/categories/search?mode=search&q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => setSearchResults(d.categories ?? []))
      .catch(() => {})
      .finally(() => setSearching(false));
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 250);
  }

  function toggleSelect(slug: string) {
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  async function toggleBookmark(cat: Category, e: React.MouseEvent) {
    e.stopPropagation();
    const next = !cat.bookmarked;
    await fetch("/api/categories/bookmark", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: cat.id, bookmarked: next }),
    });
    // Optimistically update both lists
    const patch = (c: Category) => c.id === cat.id ? { ...c, bookmarked: next } : c;
    setDefaults((prev) => {
      if (next && !prev.find((c) => c.id === cat.id)) {
        return [...prev, { ...cat, bookmarked: true }].sort((a, b) => a.name.localeCompare(b.name));
      }
      if (!next) return prev.filter((c) => c.id !== cat.id || c.bookmarked === false).map(patch);
      return prev.map(patch);
    });
    setSearchResults((prev) => prev.map(patch));
    // Re-fetch defaults to sync
    fetch("/api/categories/search?mode=default")
      .then((r) => r.json())
      .then((d) => setDefaults(d.categories ?? []))
      .catch(() => {});
  }

  async function createCategory(raw: string) {
    const slug = raw.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!slug) return;
    const res = await fetch("/api/categories/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, name: raw }),
    });
    if (!res.ok) return;
    const { category } = await res.json();
    setSelected((prev) => prev.includes(category.slug) ? prev : [...prev, category.slug]);
    setQuery("");
    setSearchResults([]);
  }

  const displayList = query.trim() ? searchResults : defaults;

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input carries the value for form submission */}
      <input type="hidden" name="categories" value={selected.join(",")} />

      {/* Selected chips */}
      <div
        className="themed-input min-h-[2.5rem] flex flex-wrap gap-1.5 items-center cursor-text p-2"
        onClick={() => { setOpen(true); setTimeout(() => searchRef.current?.focus(), 0); }}
      >
        {selected.map((slug) => (
          <span
            key={slug}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium themed-surface border themed-border"
          >
            {slug}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleSelect(slug); }}
              className="themed-muted hover:text-red-500 leading-none"
              aria-label={`Remove ${slug}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? "Search or pick categories…" : ""}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm themed-foreground placeholder:themed-muted"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto themed-surface border themed-border rounded-lg shadow-lg">
          {searching && (
            <p className="px-3 py-2 text-xs themed-muted">Searching…</p>
          )}
          {!searching && displayList.length === 0 && query.trim() && (
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer themed-row-hover text-sm"
              onClick={() => createCategory(query.trim())}
            >
              <span className="themed-muted text-xs">+</span>
              <span className="themed-foreground">Create <strong>"{query.trim()}"</strong></span>
              <span className="text-xs themed-muted ml-auto">new category</span>
            </div>
          )}
          {!searching && displayList.length === 0 && !query.trim() && (
            <p className="px-3 py-2 text-xs themed-muted">No categories available.</p>
          )}
          {displayList.map((cat) => {
            const isSelected = selected.includes(cat.slug);
            return (
              <div
                key={cat.id}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer themed-row-hover border-b themed-border last:border-b-0 ${isSelected ? "opacity-60" : ""}`}
                onClick={() => toggleSelect(cat.slug)}
              >
                <span className="flex items-center gap-2 text-sm">
                  {isSelected && <span className="text-xs themed-muted">✓</span>}
                  <span className="themed-foreground">{cat.name}</span>
                  <span className="text-xs themed-muted">{cat.slug}</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => toggleBookmark(cat, e)}
                  className={`text-xs px-1.5 py-0.5 rounded transition-colors ${cat.bookmarked ? "text-yellow-500 hover:text-yellow-400" : "themed-muted hover:text-yellow-500"}`}
                  aria-label={cat.bookmarked ? "Remove bookmark" : "Bookmark category"}
                  title={cat.bookmarked ? "Bookmarked — click to remove" : "Bookmark this category"}
                >
                  {cat.bookmarked ? "★" : "☆"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
