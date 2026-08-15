import Link from "next/link";
import ObjectRender from "@/components/ObjectRender";
import type { ResolvedEmbed } from "@/lib/embed-resolve";

/**
 * Draws a resolved embed.
 *
 * Split out from `<Embed>` (which does the database work) so the editor Preview
 * can render the identical markup in the browser from the JSON the embeds API
 * returns — one renderer, so preview and published output cannot drift.
 */
export default function EmbedBody({ embed }: { embed: ResolvedEmbed }) {
  if (embed.kind !== "object") {
    return (
      <aside className="my-8">
        <Link href={embed.href} className="ps-embed-card themed-card block p-5">
          <span className="ps-eyebrow block mb-2">
            {embed.kind === "book" ? "Book" : "Article"}
          </span>
          <span className="block themed-heading" style={{ fontSize: "1.0625rem", lineHeight: 1.4 }}>
            {embed.title}
          </span>
          {embed.summary && (
            <span
              className="block mt-2 themed-muted"
              style={{ fontSize: "0.875rem", lineHeight: 1.6 }}
            >
              {embed.summary}
            </span>
          )}
        </Link>
      </aside>
    );
  }

  return (
    <figure className="ps-embed my-8">
      <ObjectRender
        publisher={embed.publisher}
        slug={embed.slug}
        type={embed.type}
        content={embed.content}
      />
      <figcaption className="ps-embed-caption mt-2 flex items-baseline justify-between gap-4">
        <span>{embed.description || embed.name}</span>
        <Link href={embed.href} className="shrink-0 themed-hover-foreground transition-colors">
          View {embed.type} →
        </Link>
      </figcaption>
    </figure>
  );
}

/** Shown in place of anything that does not resolve — never says why. */
export function EmbedMissing({ slug }: { slug: string }) {
  return (
    <div className="my-8 p-4 rounded border themed-border text-sm themed-muted">
      Nothing to embed for <code className="themed-inline-code">{slug}</code>.
    </div>
  );
}
