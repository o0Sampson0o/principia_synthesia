/**
 * GET /api/admin/cron/check-stale-articles
 *
 * Finds published articles whose `last_verified_at` is older than the
 * STALE_ARTICLE_DAYS threshold (default 180 days) and writes in-app
 * notifications for each article's owner(s). Deduplicates so that an
 * already-unread stale notification for the same article is not duplicated.
 *
 * Requires `Authorization: Bearer <CRON_SECRET>`.
 *
 * Vercel cron config:
 * { "path": "/api/admin/cron/check-stale-articles", "schedule": "0 4 * * 1" }
 * (Runs weekly on Monday at 04:00 UTC.)
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { orgMemberships } from "@/db/schema";
import { sql } from "drizzle-orm";
import { notifyDigest, type StaleArticleItem } from "@/lib/notifications";

type StaleRow = {
  id: number;
  slug: string;
  title: string;
  owner_type: string;
  owner_id: number;
  publisher_slug: string;
};

async function resolveAuthors(
  ownerType: string,
  ownerId: number
): Promise<number[]> {
  if (ownerType === "user") {
    return [ownerId];
  }
  // Org: notify super_admins and admins
  const members = await db
    .select({ userId: orgMemberships.userId })
    .from(orgMemberships)
    .where(
      sql`${orgMemberships.orgId} = ${ownerId} AND ${orgMemberships.role} IN ('super_admin', 'admin')`
    );
  return members.map((m) => m.userId);
}

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const threshold = Number(process.env.STALE_ARTICLE_DAYS ?? "180");

  const result = await db.execute(sql`
    SELECT a.id, a.slug, a.title, a.owner_type, a.owner_id, p.slug AS publisher_slug
    FROM articles a
    JOIN publishers p ON
      (a.owner_type = 'user' AND p.user_id = a.owner_id) OR
      (a.owner_type = 'org'  AND p.org_id  = a.owner_id)
    WHERE a.is_internal = false
      AND a.metadata->>'status' = 'published'
      AND a.last_verified_at < NOW() - (${threshold}::int * INTERVAL '1 day')
  `);

  const staleRows = (result as unknown as { rows?: StaleRow[] }).rows ?? (result as unknown as StaleRow[]);

  // Group stale articles by recipient user ID so each author gets one digest.
  const byUser = new Map<number, StaleArticleItem[]>();
  for (const row of staleRows) {
    const recipients = await resolveAuthors(row.owner_type, row.owner_id);
    const item: StaleArticleItem = {
      articleId: row.id,
      slug: row.slug,
      publisherSlug: row.publisher_slug,
      title: row.title,
    };
    for (const userId of recipients) {
      const existing = byUser.get(userId) ?? [];
      existing.push(item);
      byUser.set(userId, existing);
    }
  }

  // Send (or update) one digest notification per author.
  for (const [userId, articles] of byUser) {
    await notifyDigest(userId, "stale_articles_digest", { articles, count: articles.length });
  }

  return NextResponse.json({ checked: staleRows.length, notified: byUser.size });
}
