/**
 * Slug-based include/exclude filter shared by pull, push and status.
 *
 * Two mutually exclusive modes:
 *   --only  a,b,c   inclusive — sync only these, skip everything else
 *   --except a,b,c  exclusive — sync everything except these
 * Neither given → everything is selected (sync all, the default).
 *
 * A term is either:
 *   `slug`         matches a standalone article, a book, or a section of any
 *                  book with that slug. Naming a book also selects every
 *                  section inside it.
 *   `book/section` matches only that section of that book.
 *
 * The qualified form exists because book-internal slugs are only unique within
 * their own book: a bare `intro` can name sections in several books at once.
 */
export class Selection {
  private readonly only: Term[] | null;
  private readonly except: Term[];
  /** Raw terms actually seen among real slugs — to flag typos. */
  private readonly matched = new Set<string>();

  constructor(only?: string, except?: string) {
    if (only !== undefined && except !== undefined) {
      throw new Error("Use --only or --except, not both.");
    }
    this.only = only !== undefined ? splitTerms(only) : null;
    this.except = splitTerms(except);
    if (this.only?.length === 0) {
      throw new Error("--only was given with no slugs (nothing would sync).");
    }
  }

  /** True when any filter is in effect (used to phrase summaries/warnings). */
  get active(): boolean {
    return this.only !== null || this.except.length > 0;
  }

  /** True in --only (allowlist) mode; false when unfiltered or in --except mode. */
  get inclusive(): boolean {
    return this.only !== null;
  }

  /**
   * Whether an article, book or section should be synced.
   *
   * @param slug The article, book or section slug.
   * @param book Owning book slug for a section; null for standalone articles
   *             and for books themselves.
   */
  isSelected(slug: string, book: string | null = null): boolean {
    if (this.only) {
      const hit = this.only.find((t) => matches(t, slug, book));
      if (hit) this.matched.add(hit.raw);
      return hit !== undefined;
    }
    const hit = this.except.find((t) => matches(t, slug, book));
    if (hit) {
      this.matched.add(hit.raw);
      return false;
    }
    return true;
  }

  /** Selection terms that never matched a real slug (likely typos). */
  unmatched(): string[] {
    const terms = this.only ?? this.except;
    return terms.filter((t) => !this.matched.has(t.raw)).map((t) => t.raw);
  }

  /** Warn once about terms that matched nothing this run. */
  warnUnmatched(): void {
    for (const term of this.unmatched()) {
      console.warn(`! "${term}" matched no article, book or section slug`);
    }
  }
}

interface Term {
  raw: string;
  /** Book slug for a `book/section` term; null for a bare term. */
  book: string | null;
  slug: string;
}

function matches(term: Term, slug: string, book: string | null): boolean {
  if (term.book !== null) return term.book === book && term.slug === slug;
  // A bare term matches the thing itself, or — when it names a book — every
  // section inside that book.
  return term.slug === slug || term.slug === book;
}

function splitTerms(value: string | undefined): Term[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => {
      const slash = raw.indexOf("/");
      if (slash === -1) return { raw, book: null, slug: raw };
      return { raw, book: raw.slice(0, slash), slug: raw.slice(slash + 1) };
    });
}
