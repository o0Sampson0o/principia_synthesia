import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { ilike, asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const rows = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(q ? ilike(categories.slug, `${q}%`) : undefined)
    .orderBy(asc(categories.slug))
    .limit(10);
  return NextResponse.json(rows.map((r) => r.slug));
}
