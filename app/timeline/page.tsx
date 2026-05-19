import { db } from "@/db";
import { events, resourceVisibility, publishers } from "@/db/schema";
import { eq, and, gte, lte, isNull, or, desc, countDistinct, min } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import TimelineClientShell from "@/components/TimelineClientShell";

const PER_PAGE = 20;

type TimelineFilters = {
  category: string | undefined;
  pubFilter: string | undefined;
  from: string | undefined;
  to: string | undefined;
};

async function queryTimeline(filters: TimelineFilters, currentPage: number) {
  const { category, pubFilter, from, to } = filters;
  const offset = (currentPage - 1) * PER_PAGE;

  const conditions = [
    or(
      isNull(resourceVisibility.visibility),
      eq(resourceVisibility.visibility, "public")
    ),
  ];

  if (category) {
    conditions.push(eq(events.category, category));
  }

  if (pubFilter) {
    conditions.push(eq(publishers.slug, pubFilter));
  }

  if (from && !Number.isNaN(Date.parse(from))) {
    conditions.push(gte(events.eventDate, new Date(from)));
  }

  if (to && !Number.isNaN(Date.parse(to))) {
    conditions.push(lte(events.eventDate, new Date(to)));
  }

  const whereClause = and(...conditions);

  const baseQuery = db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      description: events.description,
      eventDate: events.eventDate,
      category: events.category,
      isEraStart: events.isEraStart,
      isEraEnd: events.isEraEnd,
      eraName: events.eraName,
      publisherSlug: min(publishers.slug),
    })
    .from(events)
    .leftJoin(
      resourceVisibility,
      and(
        eq(resourceVisibility.resourceType, "event"),
        eq(resourceVisibility.ownerType, events.ownerType),
        eq(resourceVisibility.ownerId, events.ownerId),
        eq(resourceVisibility.resourceKey, events.slug)
      )
    )
    .innerJoin(
      publishers,
      or(
        and(
          eq(events.ownerType, "user"),
          eq(publishers.kind, "user"),
          eq(publishers.userId, events.ownerId)
        ),
        and(
          eq(events.ownerType, "org"),
          eq(publishers.kind, "org"),
          eq(publishers.orgId, events.ownerId)
        )
      )
    )
    .where(whereClause)
    .groupBy(
      events.id,
      events.slug,
      events.title,
      events.description,
      events.eventDate,
      events.category,
      events.isEraStart,
      events.isEraEnd,
      events.eraName
    );

  const [countResult, rows] = await Promise.all([
    db
      .select({ total: countDistinct(events.id) })
      .from(events)
      .leftJoin(
        resourceVisibility,
        and(
          eq(resourceVisibility.resourceType, "event"),
          eq(resourceVisibility.ownerType, events.ownerType),
          eq(resourceVisibility.ownerId, events.ownerId),
          eq(resourceVisibility.resourceKey, events.slug)
        )
      )
      .innerJoin(
        publishers,
        or(
          and(
            eq(events.ownerType, "user"),
            eq(publishers.kind, "user"),
            eq(publishers.userId, events.ownerId)
          ),
          and(
            eq(events.ownerType, "org"),
            eq(publishers.kind, "org"),
            eq(publishers.orgId, events.ownerId)
          )
        )
      )
      .where(whereClause),
    baseQuery.orderBy(desc(events.eventDate)).limit(PER_PAGE).offset(offset),
  ]);

  return { total: countResult[0]?.total ?? 0, rows };
}

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    publisher?: string;
    from?: string;
    to?: string;
    page?: string;
    view?: string;
  }>;
}) {
  const { category, publisher: pubFilter, from, to, page, view } = await searchParams;
  const session = await getSession();
  const currentPage = Math.max(1, Number(page ?? 1));
  const activeView: "visual" | "list" = view === "list" ? "list" : "visual";

  const filters: TimelineFilters = { category, pubFilter, from, to };

  let total: number;
  let rows: Awaited<ReturnType<typeof queryTimeline>>["rows"];

  if (!session) {
    const getCachedTimeline = unstable_cache(
      (f: TimelineFilters, p: number) => queryTimeline(f, p),
      ["public-timeline-v3"],
      { tags: ["timeline"], revalidate: 300 }
    );
    const result = await getCachedTimeline(filters, currentPage);
    total = result.total;
    rows = result.rows;
  } else {
    const result = await queryTimeline(filters, currentPage);
    total = result.total;
    rows = result.rows;
  }

  const seen = new Set<number>();
  const uniqueRows = rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const totalPages = Math.ceil(total / PER_PAGE);

  const hasFilters = category || pubFilter || from || to;

  const buildFilterHref = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      category,
      publisher: pubFilter,
      from,
      to,
      view: activeView === "list" ? "list" : undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/timeline?${qs}` : "/timeline";
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold themed-heading mb-8">Timeline</h1>

      <form method="GET" action="/timeline" className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium themed-secondary mb-1" htmlFor="category">
            Category
          </label>
          <input
            id="category"
            type="text"
            name="category"
            defaultValue={category ?? ""}
            className="themed-input w-full text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium themed-secondary mb-1" htmlFor="publisher">
            Publisher slug
          </label>
          <input
            id="publisher"
            type="text"
            name="publisher"
            defaultValue={pubFilter ?? ""}
            className="themed-input w-full text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium themed-secondary mb-1" htmlFor="from">
            From date
          </label>
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className="themed-input w-full text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium themed-secondary mb-1" htmlFor="to">
            To date
          </label>
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className="themed-input w-full text-sm"
          />
        </div>

        {activeView === "list" && (
          <input type="hidden" name="view" value="list" />
        )}

        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" className="themed-btn-primary text-sm px-4 py-2">
            Filter
          </button>
          {hasFilters && (
            <Link href="/timeline" className="themed-btn-ghost text-sm px-4 py-2">
              Clear
            </Link>
          )}
        </div>
      </form>

      {uniqueRows.length === 0 ? (
        <p className="themed-muted">No events found.</p>
      ) : (
        <TimelineClientShell
          rows={uniqueRows}
          activeView={activeView}
          category={category}
          pubFilter={pubFilter}
          from={from}
          to={to}
        />
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath={buildFilterHref({ page: undefined })}
      />
    </main>
  );
}
