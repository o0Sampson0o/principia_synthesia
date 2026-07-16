import { NextResponse } from "next/server";
import { db } from "@/db";
import { books } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { authorizePublisherRequest } from "@/lib/api-v1";

/**
 * GET /api/v1/publishers/[publisher]/books — read-only book list.
 * Book/curriculum structure is not editable over the sync API (v1); this
 * exists so sync clients can mirror book structure locally.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ publisher: string }> }
) {
  const { publisher } = await params;
  const auth = await authorizePublisherRequest(request, publisher);
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select({
      id: books.id,
      slug: books.slug,
      title: books.title,
      summary: books.summary,
      updatedAt: books.updatedAt,
    })
    .from(books)
    .where(and(eq(books.ownerType, auth.ownerType), eq(books.ownerId, auth.ownerId), isNull(books.deletedAt)))
    .orderBy(books.slug);

  return NextResponse.json({ books: rows });
}
