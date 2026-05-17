/**
 * GET /api/admin/cron/prune-views
 *
 * Deletes articleViews rows older than 90 days. The homepage query only uses
 * views from the last 30 days, so anything older is dead weight.
 *
 * Requires a `Authorization: Bearer <CRON_SECRET>` header. Returns 401 if the
 * header is missing or does not match the environment variable.
 *
 * Suggested Vercel Cron config (add to vercel.json if/when desired):
 * {
 *   "crons": [{ "path": "/api/admin/cron/prune-views", "schedule": "0 3 * * 0" }]
 * }
 * This runs weekly on Sunday at 03:00 UTC. Set CRON_SECRET in the Vercel
 * dashboard and pass it as the Authorization header from the cron caller.
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { articleViews } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const result = await db
    .delete(articleViews)
    .where(sql`${articleViews.viewedAt} < NOW() - INTERVAL '90 days'`);

  const deleted = (result as { rowCount?: number }).rowCount ?? 0;

  return NextResponse.json({ deleted });
}
