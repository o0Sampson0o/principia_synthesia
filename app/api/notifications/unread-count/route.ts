import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ count: 0 });

  const [row] = await db
    .select({ c: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, session.userId),
        isNull(notifications.readAt)
      )
    );

  return NextResponse.json({ count: row?.c ?? 0 });
}
