import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { db } from "@/db";
import { articles, books } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import BinClient from "./BinClient";

const BIN_DAYS = 30;

export default async function BinPage({ params }: { params: Promise<{ publisher: string }> }) {
  const { publisher: publisherSlug } = await params;
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const session = await requireSession();
  const ownerType = pub.kind === "user" ? "user" : "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  if (!(await canEditContent(session, ownerType, ownerId))) {
    redirect(`/${publisherSlug}`);
  }

  const [deletedArticles, deletedBooks] = await Promise.all([
    db
      .select({ id: articles.id, slug: articles.slug, title: articles.title, deletedAt: articles.deletedAt })
      .from(articles)
      .where(and(
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        isNotNull(articles.deletedAt),
      ))
      .orderBy(articles.deletedAt),
    db
      .select({ id: books.id, slug: books.slug, title: books.title, deletedAt: books.deletedAt })
      .from(books)
      .where(and(
        eq(books.ownerType, ownerType),
        eq(books.ownerId, ownerId),
        isNotNull(books.deletedAt),
      ))
      .orderBy(books.deletedAt),
  ]);

  const now = Date.now();
  const items = [
    ...deletedArticles.map((a) => ({ ...a, kind: "article" as const })),
    ...deletedBooks.map((b) => ({ ...b, kind: "book" as const })),
  ]
    .map((a) => {
      const deletedMs = new Date(a.deletedAt!).getTime();
      const expiresMs = deletedMs + BIN_DAYS * 86400_000;
      const daysLeft = Math.max(0, Math.ceil((expiresMs - now) / 86400_000));
      return { ...a, deletedAt: new Date(a.deletedAt!), expiresAt: new Date(expiresMs), daysLeft };
    })
    .sort((a, b) => a.deletedAt.getTime() - b.deletedAt.getTime());

  return (
    <main className="w-full max-w-3xl mx-auto px-5 py-12 sm:py-16">
      <div className="mb-8">
        <p className="ps-eyebrow mb-3">Bin</p>
        <h1 className="ps-display themed-heading mb-2" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
          Deleted articles &amp; books
        </h1>
        <p className="themed-muted" style={{ fontSize: "0.875rem" }}>
          Kept for {BIN_DAYS} days before permanent removal.
        </p>
      </div>
      <BinClient publisherSlug={publisherSlug} items={items} />
    </main>
  );
}
