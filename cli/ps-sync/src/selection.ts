/**
 * Slug-based include/exclude filter shared by pull, push and status.
 *
 * Two mutually exclusive modes, both operating on article *and* book slugs:
 *   --only  a,b,c   inclusive — sync only these, skip everything else
 *   --except a,b,c  exclusive — sync everything except these
 * Neither given → everything is selected (sync all, the default).
 *
 * A slug may name an article or a book; a term matching both selects both.
 */
export class Selection {
  private readonly only: Set<string> | null;
  private readonly except: Set<string>;
  /** Selection terms actually seen among real slugs — to flag typos. */
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

  /** Whether a given article/book slug should be synced under this filter. */
  isSelected(slug: string): boolean {
    if (this.only) {
      const hit = this.only.has(slug);
      if (hit) this.matched.add(slug);
      return hit;
    }
    if (this.except.has(slug)) {
      this.matched.add(slug);
      return false;
    }
    return true;
  }

  /** Selection terms that never matched a real slug (likely typos). */
  unmatched(): string[] {
    const terms = this.only ?? this.except;
    return [...terms].filter((t) => !this.matched.has(t));
  }

  /** Warn once about terms that matched nothing this run. */
  warnUnmatched(): void {
    for (const term of this.unmatched()) {
      console.warn(`! "${term}" matched no article or book slug`);
    }
  }
}

function splitSlugs(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
