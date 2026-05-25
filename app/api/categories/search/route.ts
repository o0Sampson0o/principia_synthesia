import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, categoryBookmarks } from "@/db/schema";
import { ilike, isNull, or, eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const mode = searchParams.get("mode") ?? "default"; // "default" | "search"

  const session = await getSession();

  if (mode === "default") {
    // Admin-created categories + user's bookmarks
    const adminCats = await db
      .select({ id: categories.id, slug: categories.slug, name: categories.name, bookmarked: sql<boolean>`false` })
      .from(categories)
      .where(isNull(categories.createdByUserId))
      .orderBy(categories.name);

    if (!session) {
      return NextResponse.json({ categories: adminCats });
    }

    const bookmarked = await db
      .select({ id: categories.id, slug: categories.slug, name: categories.name, bookmarked: sql<boolean>`true` })
      .from(categories)
      .innerJoin(categoryBookmarks, eq(categoryBookmarks.categoryId, categories.id))
      .where(eq(categoryBookmarks.userId, session.userId));

    // Merge: bookmarked overrides admin (dedup by id)
    const seen = new Set<number>();
    const merged = [];
    for (const c of [...bookmarked, ...adminCats]) {
      if (!seen.has(c.id)) { seen.add(c.id); merged.push(c); }
    }
    merged.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ categories: merged });
  }

  // Search mode
  if (!q) return NextResponse.json({ categories: [] });

  const bookmarkedIds = session
    ? new Set(
        (await db
          .select({ categoryId: categoryBookmarks.categoryId })
          .from(categoryBookmarks)
          .where(eq(categoryBookmarks.userId, session.userId))
        ).map((r) => r.categoryId)
      )
    : new Set<number>();

  const results = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .where(or(ilike(categories.name, `%${q}%`), ilike(categories.slug, `%${q}%`)))
    .orderBy(categories.name)
    .limit(20);

  return NextResponse.json({
    categories: results.map((c) => ({ ...c, bookmarked: bookmarkedIds.has(c.id) })),
  });
}
