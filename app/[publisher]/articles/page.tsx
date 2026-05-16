import { notFound } from "next/navigation";
import Link from "next/link";
import { resolvePublisher } from "@/lib/publisher";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export default async function PublisherArticlesPage({
  params,
}: {
  params: Promise<{ publisher: string }>;
}) {
  const { publisher: publisherSlug } = await params;
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const allArticles = await db
    .select({ id: articles.id, slug: articles.slug, title: articles.title, updatedAt: articles.updatedAt })
    .from(articles)
    .where(
      and(
        eq(articles.ownerType, ownerType),
        eq(articles.ownerId, ownerId),
        eq(articles.isInternal, false)
      )
    );

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold themed-heading mb-2">
        {pub.displayName}&rsquo;s articles
      </h1>
      <p className="themed-muted text-sm mb-8">@{pub.slug}</p>

      {allArticles.length === 0 ? (
        <p className="themed-muted">No articles yet.</p>
      ) : (
        <ul className="space-y-4">
          {allArticles.map((a) => (
            <li key={a.id} className="border-b themed-border pb-4">
              <Link
                href={`/${publisherSlug}/articles/${a.slug}`}
                className="text-xl font-medium themed-link"
              >
                {a.title}
              </Link>
              {a.updatedAt && (
                <p className="text-xs themed-muted mt-1">
                  Updated{" "}
                  {a.updatedAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
