import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categoryBookmarks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { categoryId, bookmarked } = await request.json() as { categoryId: number; bookmarked: boolean };

  if (bookmarked) {
    await db.insert(categoryBookmarks).values({
      userId: session.userId,
      categoryId,
    }).onConflictDoNothing();
  } else {
    await db.delete(categoryBookmarks).where(
      and(
        eq(categoryBookmarks.userId, session.userId),
        eq(categoryBookmarks.categoryId, categoryId),
      )
    );
  }

  return NextResponse.json({ ok: true });
}
