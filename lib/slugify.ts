/**
 * Title → slug derivation for content whose slug the author should never have
 * to type (book sections, books). Output always satisfies the
 * `^<prefix>[a-z0-9]+(?:-[a-z0-9]+)*$` shape the validation schemas require.
 *
 * Titles in this project often carry inline maths (`$\mathbb{R}^n$`), so TeX
 * control words are dropped before slugging: "The space $\mathbb{R}^n$"
 * becomes "the-space-r-n", not "the-space-mathbb-r-n".
 */

/** Lowercase ASCII slug body (no prefix). Empty string when nothing survives. */
export function slugifyTitle(title: string, maxLength = 60): string {
  return title
    .replace(/\\[a-zA-Z]+/g, " ") // TeX control words: \mathbb, \alpha, …
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining marks left by NFKD (é → e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/**
 * `prefix` + slugified title, falling back to `prefix + fallback` when the
 * title has no slug-able characters (e.g. a title that is only maths symbols).
 */
export function prefixedSlug(prefix: string, title: string, fallback: string): string {
  return prefix + (slugifyTitle(title) || fallback);
}

/**
 * First of `base`, `base-2`, `base-3`, … not in `taken`. Records the result in
 * `taken`, so successive calls within one batch never collide with each other.
 */
export function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

/**
 * Accepts what an author typed in a prefixed slug field — with or without the
 * prefix, any case, spaces — and returns the canonical prefixed form, or null
 * when the field was left blank (the caller then derives one from the title).
 */
export function normalizePrefixedSlug(prefix: string, input: string): string | null {
  const body = input.trim().toLowerCase();
  if (!body) return null;
  const withoutPrefix = body.startsWith(prefix) ? body.slice(prefix.length) : body;
  const slug = slugifyTitle(withoutPrefix, 120);
  return slug ? prefix + slug : null;
}
