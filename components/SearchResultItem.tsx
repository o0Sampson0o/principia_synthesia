import Link from "next/link";

interface Props {
  type: "article" | "book" | "object";
  publisherSlug: string;
  slug: string;
  title: string;
  description?: string | null;
  objectType?: string;
}

export default function SearchResultItem({ type, publisherSlug, slug, title, description, objectType }: Props) {
  let href = `/${publisherSlug}/articles/${slug}`;
  if (type === "book") href = `/${publisherSlug}/books/${slug}`;
  else if (type === "object") href = `/${publisherSlug}/objects/${slug}`;

  const metaParts = [`@${publisherSlug}`, objectType].filter(Boolean).join(" · ");

  return (
    <div
      className="hover:bg-[var(--surface)] transition-colors"
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "0.875rem 0.5rem",
      }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 5 }}>
        <Link href={href} className="ps-list-link" style={{ flex: 1, minWidth: 0 }}>
          {title}
        </Link>
        {objectType && (
          <span
            style={{
              fontSize: "0.4375rem",
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted-foreground)",
              flexShrink: 0,
            }}
          >
            {objectType}
          </span>
        )}
      </div>

      {/* Meta: @publisher · type */}
      <p
        style={{
          fontSize: "0.5625rem",
          fontFamily: "ui-monospace, monospace",
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "var(--muted-foreground)",
          marginBottom: description ? 6 : 0,
        }}
      >
        {metaParts}
      </p>

      {/* Description snippet */}
      {description && (
        <p
          className="line-clamp-2"
          style={{
            fontSize: "0.875rem",
            color: "var(--muted-foreground)",
            lineHeight: 1.65,
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
}
