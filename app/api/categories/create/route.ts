import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug, name } = await request.json() as { slug: string; name: string };

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  // Return existing if already there
  const [existing] = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);

  if (existing) {
    return NextResponse.json({ category: { ...existing, bookmarked: false } });
  }

  const [created] = await db
    .insert(categories)
    .values({ slug, name: name || slug, createdByUserId: session.userId })
    .returning({ id: categories.id, slug: categories.slug, name: categories.name });

  return NextResponse.json({ category: { ...created, bookmarked: false } });
}
