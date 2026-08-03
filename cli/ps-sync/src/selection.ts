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
  private readonly only: Set<string> | null;
  private readonly except: Set<string>;
  /** Terms actually seen among real slugs — to flag typos. */
  private readonly matched = new Set<string>();

  constructor(only?: string, except?: string) {
    if (only !== undefined && except !== undefined) {
      throw new Error("Use --only or --except, not both.");
    }
    this.only = only !== undefined ? new Set(splitSlugs(only)) : null;
    this.except = new Set(splitSlugs(except));
    if (this.only?.size === 0) {
      throw new Error("--only was given with no slugs (nothing would sync).");
    }
  }

  /** True when any filter is in effect (used to phrase summaries/warnings). */
  get active(): boolean {
    return this.only !== null || this.except.size > 0;
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
    const set = this.only ?? this.except;
    // Every form the user could have typed for this item. Comparing against
    // these means a hit is always the literal term, so typo reporting is exact.
    const hit = [slug, book, book && `${book}/${slug}`].find(
      (candidate) => candidate !== null && set.has(candidate)
    );
    if (hit) this.matched.add(hit);
    return this.only ? hit !== undefined : hit === undefined;
  }

  /** Selection terms that never matched a real slug (likely typos). */
  unmatched(): string[] {
    const terms = this.only ?? this.except;
    return [...terms].filter((t) => !this.matched.has(t));
  }

  /** Warn once about terms that matched nothing this run. */
  warnUnmatched(): void {
    for (const term of this.unmatched()) {
      console.warn(`! "${term}" matched no article, book or section slug`);
    }
  }
}

function splitSlugs(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
