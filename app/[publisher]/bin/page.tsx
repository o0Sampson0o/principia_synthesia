import { notFound, redirect } from "next/navigation";
import { resolvePublisher } from "@/lib/publisher";
import { requireSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { db } from "@/db";
import { articles } from "@/db/schema";
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

  const deleted = await db
    .select({ id: articles.id, slug: articles.slug, title: articles.title, deletedAt: articles.deletedAt })
    .from(articles)
    .where(and(
      eq(articles.ownerType, ownerType),
      eq(articles.ownerId, ownerId),
      isNotNull(articles.deletedAt),
    ))
    .orderBy(articles.deletedAt);

  const now = Date.now();
  const items = deleted.map((a) => {
    const deletedMs = new Date(a.deletedAt!).getTime();
    const expiresMs = deletedMs + BIN_DAYS * 86400_000;
    const daysLeft = Math.max(0, Math.ceil((expiresMs - now) / 86400_000));
    return { ...a, deletedAt: new Date(a.deletedAt!), expiresAt: new Date(expiresMs), daysLeft };
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold themed-heading mb-1">Bin</h1>
        <p className="text-sm themed-muted">Deleted articles are kept for {BIN_DAYS} days before being permanently removed.</p>
      </header>
      <BinClient publisherSlug={publisherSlug} items={items} />
    </main>
  );
}
