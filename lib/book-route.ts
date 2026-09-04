/**
 * Shared loader for the book routes.
 *
 * A book URL renders two React trees that both need the same three things —
 * the publisher, the book row, and the curriculum structure:
 *
 *   app/[publisher]/books/[bookSlug]/layout.tsx           (the spine)
 *   app/[publisher]/books/[bookSlug]/page.tsx             (the book landing)
 *   app/[publisher]/books/[bookSlug]/[...section]/page.tsx (a section)
 *
 * Next.js renders a layout in PARALLEL with its page, so without deduplication
 * every book page view would run each query twice. Every route in this app is
 * dynamic and the Neon compute quota is a hard monthly ceiling, so that doubling
 * is not acceptable. `React.cache` memoises per request: the layout and the page
 * issue one set of queries between them, whichever renders first.
 *
 * ACCESS: the layout must call this too and honour `visible`. `notFound()` in a
 * page renders the not-found boundary INSIDE the surrounding layout, so a layout
 * that skipped the check would keep painting a private book's table of contents
 * around the 404 — leaking the book's structure to anyone who probes a URL.
 */
import { cache } from "react";
import { db } from "@/db";
import { books } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canView } from "@/lib/access";
import { loadBookStructure, type BookStructure } from "@/lib/book-structure";

export interface BookRouteContext {
  publisherSlug: string;
  ownerType: "user" | "org";
  ownerId: number;
  book: typeof books.$inferSelect;
  structure: BookStructure;
  /** False when the viewer may not see this book — render nothing book-shaped. */
  visible: boolean;
}

/**
 * Resolve a book URL to everything both trees need, or null when the publisher
 * or book does not exist. Memoised for the lifetime of one request.
 */
export const getBookRouteContext = cache(
  async (publisherSlug: string, bookSlug: string): Promise<BookRouteContext | null> => {
    const pub = await resolvePublisher(publisherSlug);
    if (!pub) return null;

    const ownerType = pub.kind as "user" | "org";
    const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

    const [book] = await db
      .select()
      .from(books)
      .where(
        and(
          eq(books.slug, bookSlug),
          eq(books.ownerType, ownerType),
          eq(books.ownerId, ownerId),
          isNull(books.deletedAt)
        )
      )
      .limit(1);
    if (!book) return null;

    const session = await getSession();
    const visible = await canView({ type: "book", ownerType, ownerId, slug: bookSlug }, session);

    // Skip the curriculum query entirely when the viewer cannot see the book —
    // there is nothing either tree is allowed to render from it.
    const structure = visible
      ? await loadBookStructure(book.id)
      : { children: [], parts: [], orderedSections: [], articleIndex: new Map(), dividerIndex: new Map() };

    return { publisherSlug, ownerType, ownerId, book, structure, visible };
  }
);
