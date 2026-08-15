import { db } from "@/db";
import { books, objects } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { findArticleBySlug } from "@/lib/article-lookup";
import { parseWikilinkTarget } from "@/lib/wikilink-syntax";
import type { KaoContent } from "@/lib/kao";

/**
 * What an `<Embed slug="…" />` points at, once resolved.
 *
 * Deliberately carries everything a renderer needs, so neither caller has to go
 * back to the database: `<Embed>` renders this on the server, and the editor
 * Preview fetches the same shape over `/api/publishers/[publisher]/embeds/[slug]`
 * and renders it with the same components in the browser.
 */
export type ResolvedEmbed =
  | {
      kind: "object";
      publisher: string;
      slug: string;
      /** `animation` | `dataset` | `diagram` — decides how it draws. */
      type: string;
      name: string;
      description: string | null;
      content: KaoContent;
      href: string;
    }
  | {
      /** An article or a whole book — both embed as a card linking to it. */
      kind: "article" | "book";
      publisher: string;
      slug: string;
      title: string;
      summary: string | null;
      href: string;
    };

export interface EmbedTarget {
  /**
   * What to embed. Any of:
   *
   * - `thing` — a bare slug, against the embedding article's publisher
   * - `publisher:objects:thing` — the wikilink address, bracketed or not
   * - `publisher/thing` — shorthand for the same
   */
  slug: string;
  /** Explicit publisher, as an alternative to naming one in `slug`. */
  publisher?: string;
  /** The publisher of the article doing the embedding. */
  defaultPublisher: string;
}

export interface ParsedEmbedTarget {
  publisherSlug: string;
  targetSlug: string;
  /** Known only from the wikilink address form; narrows what is looked up. */
  type: "articles" | "books" | "objects" | null;
  /** The book a section belongs to, from `pub:books:book-slug:section`. */
  bookSlug: string | null;
}

/**
 * Works out which publisher and slug an embed addresses.
 *
 * The wikilink address is the form to reach for — it is what every "Copy
 * wikilink" button in the app produces, and the only one that says *what kind*
 * of thing is meant. `publisher/slug` and a bare slug stay supported as
 * shorthand.
 */
export function parseEmbedTarget({
  slug,
  publisher,
  defaultPublisher,
}: EmbedTarget): ParsedEmbedTarget {
  const wikilink = parseWikilinkTarget(slug);
  if (wikilink) {
    return {
      publisherSlug: publisher ?? wikilink.publisher,
      // A section addresses an article *inside* the named book, so the slug to
      // look up is the section's, not the book's.
      targetSlug: wikilink.section ?? wikilink.slug,
      type: wikilink.section ? "articles" : wikilink.type,
      bookSlug: wikilink.section ? wikilink.slug : null,
    };
  }

  const slashIndex = slug.indexOf("/");
  return {
    publisherSlug: publisher ?? (slashIndex === -1 ? defaultPublisher : slug.slice(0, slashIndex)),
    targetSlug: slashIndex === -1 ? slug : slug.slice(slashIndex + 1),
    type: null,
    bookSlug: null,
  };
}

/**
 * Finds what an embed target refers to, or `null`.
 *
 * Objects win over articles when a slug matches both — objects exist to be
 * embedded, articles merely can be. Anything the current viewer may not see
 * resolves to `null`, the same as a slug that does not exist, so an embed can
 * never disclose that private content is there.
 */
export async function resolveEmbed(target: EmbedTarget): Promise<ResolvedEmbed | null> {
  const { publisherSlug, targetSlug, type, bookSlug } = parseEmbedTarget(target);

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) return null;

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;
  const session = await getSession();

  if (type === "books" && !bookSlug) {
    return resolveBook({ publisherSlug, ownerType, ownerId, slug: targetSlug, session });
  }

  // Skipped when the address already said this is not an object — the whole
  // point of writing `pub:articles:x` is that it cannot be mistaken for one.
  const [obj] =
    type === "articles"
      ? []
      : await db
          .select()
          .from(objects)
          .where(
            and(
              eq(objects.slug, targetSlug),
              eq(objects.ownerType, ownerType),
              eq(objects.ownerId, ownerId)
            )
          )
          .limit(1);

  if (obj) {
    const visible = await canView({ type: "object", ownerType, ownerId, slug: targetSlug }, session);
    if (!visible) return null;
    return {
      kind: "object",
      publisher: publisherSlug,
      slug: obj.slug,
      type: obj.type,
      name: obj.name,
      description: obj.description,
      content: obj.content as KaoContent,
      href: `/${publisherSlug}/objects/${obj.slug}`,
    };
  }

  const lookup = await findArticleBySlug({ ownerType, ownerId, slug: targetSlug, bookSlug });
  if (lookup.kind !== "found") return null;

  const visible = await canView({ type: "article", ownerType, ownerId, slug: targetSlug }, session);
  if (!visible) return null;

  const article = lookup.article;
  return {
    kind: "article",
    publisher: publisherSlug,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    href: article.parentBookSlug
      ? `/${publisherSlug}/books/${article.parentBookSlug}/${article.slug}`
      : `/${publisherSlug}/articles/${article.slug}`,
  };
}

/** `pub:books:slug` — the book itself, as a card. */
async function resolveBook({
  publisherSlug,
  ownerType,
  ownerId,
  slug,
  session,
}: {
  publisherSlug: string;
  ownerType: "user" | "org";
  ownerId: number;
  slug: string;
  session: Awaited<ReturnType<typeof getSession>>;
}): Promise<ResolvedEmbed | null> {
  const [book] = await db
    .select({ slug: books.slug, title: books.title, summary: books.summary })
    .from(books)
    .where(
      and(
        eq(books.slug, slug),
        eq(books.ownerType, ownerType),
        eq(books.ownerId, ownerId),
        isNull(books.deletedAt)
      )
    )
    .limit(1);

  if (!book) return null;
  const visible = await canView({ type: "book", ownerType, ownerId, slug }, session);
  if (!visible) return null;

  return {
    kind: "book",
    publisher: publisherSlug,
    slug: book.slug,
    title: book.title,
    summary: book.summary,
    href: `/${publisherSlug}/books/${book.slug}`,
  };
}
