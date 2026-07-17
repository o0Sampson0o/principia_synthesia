interface Props {
  slug: string;
  number?: string | number;
  resolvedTitle?: string;
  resolvedHref?: string;
}

/**
 * Inline citation superscript, rendered server-side.
 *
 * The `number`, `resolvedTitle`, and `resolvedHref` props are injected at
 * build/render time by `remarkCiteNumbering` so this component stays pure.
 *
 * - If `number` is present and the citation resolved: renders `[N]` as a link.
 * - If `number` is present but unresolved: renders `[?]`.
 * - If `number` is absent (plugin not applied): renders nothing (safe fallback).
 */
export default function Cite({ number, resolvedHref, resolvedTitle }: Props) {
  if (number === undefined || number === null) return null;

  const n = String(number);

  if (!resolvedHref) {
    return (
      <sup
        title="Cited article not found"
        className="font-mono text-xs"
        // Mixed toward ink so the tiny superscript clears AA contrast
        style={{ color: "color-mix(in srgb, var(--color-warning) 70%, var(--foreground))" }}
      >
        <span className="sr-only">Cited article not found</span>
        <span aria-hidden="true">[?]</span>
      </sup>
    );
  }

  return (
    <sup>
      <a
        href={resolvedHref}
        title={resolvedTitle}
        className="themed-link font-mono text-xs"
        aria-label={`Citation ${n}: ${resolvedTitle ?? ""}`}
      >
        [{n}]
      </a>
    </sup>
  );
}
