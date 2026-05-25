/**
 * GET /api/admin/cron/prune
 *
 * Runs two cleanup jobs in one request:
 *   1. Hard-deletes articles soft-deleted more than 30 days ago (bin expiry).
 *   2. Deletes articleViews rows older than 90 days (analytics dead weight).
 *
 * Requires `Authorization: Bearer <CRON_SECRET>`. Returns 401 otherwise.
 * Registered in vercel.json — runs daily at 03:00 UTC.
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { articles, articleViews } from "@/db/schema";
import { and, isNotNull, sql } from "drizzle-orm";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const [binResult, viewsResult] = await Promise.all([
    db.delete(articles).where(
      and(
        isNotNull(articles.deletedAt),
        sql`${articles.deletedAt} < NOW() - INTERVAL '30 days'`
      )
    ),
    db.delete(articleViews).where(
      sql`${articleViews.viewedAt} < NOW() - INTERVAL '90 days'`
    ),
  ]);

  return NextResponse.json({
    binPurged: (binResult as { rowCount?: number }).rowCount ?? 0,
    viewsPurged: (viewsResult as { rowCount?: number }).rowCount ?? 0,
  });
}
