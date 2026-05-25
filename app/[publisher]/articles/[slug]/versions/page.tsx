import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { resolvePublisher } from "@/lib/publisher";
import { getSession } from "@/lib/auth";
import { canEditContent } from "@/lib/roles";
import { listSnapshots } from "@/lib/article-snapshots";

export default async function ArticleVersionsPage({
  params,
}: {
  params: Promise<{ publisher: string; slug: string }>;
}) {
  const { publisher: publisherSlug, slug } = await params;

  const pub = await resolvePublisher(publisherSlug);
  if (!pub) notFound();

  const ownerType = pub.kind;
  const ownerId = (pub.kind === "user" ? pub.userId : pub.orgId)!;

  const session = await getSession();
  if (!(await canEditContent(session, ownerType as "user" | "org", ownerId))) notFound();

  const [articleRows] = await Promise.all([
    db
      .select({ id: articles.id, title: articles.title })
      .from(articles)
      .where(
        and(
          eq(articles.slug, slug),
          eq(articles.ownerType, ownerType),
          eq(articles.ownerId, ownerId)
        )
      )
      .limit(1),
  ]);

  if (!articleRows[0]) notFound();
  const article = articleRows[0];

  const snapshots = await listSnapshots(article.id);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/${publisherSlug}/articles/${slug}`} className="themed-link text-sm">
          ← Back to article
        </Link>
      </div>

      <h1 className="text-2xl font-bold themed-heading mb-2">{article.title}</h1>
      <p className="themed-muted text-sm mb-6">Publish history — all versions are permanently accessible.</p>

      {snapshots.length === 0 ? (
        <p className="themed-muted">No snapshots yet. Publish the article to create the first version.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b themed-border text-left">
              <th className="pb-2 font-medium themed-muted">Hash</th>
              <th className="pb-2 font-medium themed-muted">Published</th>
              <th className="pb-2 font-medium themed-muted"></th>
            </tr>
          </thead>
          <tbody>
            {[...snapshots].reverse().map((s) => (
              <tr key={s.id} className="border-b themed-border">
                <td className="py-2 font-mono text-xs">
                  <code>{s.shortHash}</code>
                </td>
                <td className="py-2 themed-muted">
                  {new Date(s.publishedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="py-2 text-right">
                  <Link
                    href={`/${publisherSlug}/articles/${slug}?v=${s.shortHash}`}
                    className="themed-link"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
