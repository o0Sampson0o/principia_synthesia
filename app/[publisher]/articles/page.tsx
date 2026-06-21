import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { filterVisible } from "@/lib/access";

export default async function PublisherArticlesPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind as "user" | "org";
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const session = await getSession();
  const isOwner = await canEditContent(session, ownerType, ownerId);

  const rawArticles = await db
    .select({ id: articles.id, slug: articles.slug, title: articles.title, updatedAt: articles.updatedAt })
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        eq(articles.isInternal, false),
        isNull(articles.deletedAt)
      )
    );

  let allArticles = rawArticles;
  if (!isOwner) {
    const refs = rawArticles.map((a) => ({ type: "article" as const, ownerType, ownerId, slug: a.slug }));
    const visRefs = await filterVisible(refs, session);
    const visSlugs = new Set(visRefs.map((r) => r.slug));
    allArticles = rawArticles.filter((a) => visSlugs.has(a.slug));
  }

  return (
    <main className="max-w-5xl mx-auto px-5 py-10 sm:py-14">
      <div className="mb-10">
        <p className="ps-eyebrow mb-1.5">Articles</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
          {pub.displayName}
        </h1>
      </div>

      {allArticles.length === 0 ? (
        <p className="themed-muted" style={{ fontSize: "0.9375rem" }}>No articles yet.</p>
      ) : (
        <div className="ps-content-box">
          {allArticles.map((a) => (
            <div key={a.id} className="ps-content-row flex-col items-start gap-1">
              <Link
                href={`/${publisherSlug}/articles/${a.slug}`}
                className="ps-list-link"
              >
                {a.title}
              </Link>
              {a.updatedAt && (
                <p className="themed-muted" style={{ fontSize: "0.75rem" }}>
                  Updated{" "}
                  {a.updatedAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
