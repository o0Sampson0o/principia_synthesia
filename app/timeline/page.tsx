import { db } from "@/db";
import { events, resourceVisibility, publishers } from "@/db/schema";
import { eq, and, gte, lte, isNull, or, desc, countDistinct, min, ilike } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import TimelineClientShell from "@/components/TimelineClientShell";
import { expandRecurrence } from "@/lib/recurrence";

const PER_PAGE = 20;

type TimelineFilters = {
  q: string | undefined;
  era: string | undefined;
  category: string | undefined;
  pubFilter: string | undefined;
  from: string | undefined;
  to: string | undefined;
};

async function queryTimeline(filters: TimelineFilters, currentPage: number) {
  const { q, era, category, pubFilter, from, to } = filters;
  const offset = (currentPage - 1) * PER_PAGE;

  const conditions = [
    or(
      isNull(resourceVisibility.visibility),
      eq(resourceVisibility.visibility, "public")
    ),
  ];

  if (q) {
    conditions.push(
      or(
        ilike(events.title, `%${q}%`),
        ilike(events.description, `%${q}%`)
      )!
    );
  }

  if (era) {
    conditions.push(eq(events.eraName, era));
  }

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
      recurrenceRule: events.recurrenceRule,
      recurrenceUntil: events.recurrenceUntil,
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
      events.eraName,
      events.recurrenceRule,
      events.recurrenceUntil
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
    q?: string;
    era?: string;
    category?: string;
    publisher?: string;
    from?: string;
    to?: string;
    page?: string;
    view?: string;
  }>;
}) {
  const { q: rawQ, era: rawEra, category, publisher: pubFilter, from, to, page, view } = await searchParams;
  const session = await getSession();
  const currentPage = Math.max(1, Number(page ?? 1));
  const activeView: "visual" | "list" = view === "list" ? "list" : "visual";

  const q = rawQ?.trim()?.slice(0, 200) || undefined;
  const era = rawEra?.trim() || undefined;

  const filters: TimelineFilters = { q, era, category, pubFilter, from, to };

  let total: number;
  let rows: Awaited<ReturnType<typeof queryTimeline>>["rows"];

  if (!session) {
    const cacheKey = [
      "public-timeline-v4",
      q ?? "",
      era ?? "",
      category ?? "",
      pubFilter ?? "",
      from ?? "",
      to ?? "",
      String(currentPage),
    ];
    const getCachedTimeline = unstable_cache(
      (f: TimelineFilters, p: number) => queryTimeline(f, p),
      cacheKey,
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

  const seen = new Set<number | string>();
  const uniqueRows = rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const fiveYearsMs = 5 * 365.25 * 24 * 60 * 60 * 1000;
  const now = new Date();
  const windowFrom = from && !Number.isNaN(Date.parse(from))
    ? new Date(from)
    : new Date(now.getTime() - fiveYearsMs);
  const windowTo = to && !Number.isNaN(Date.parse(to))
    ? new Date(to)
    : new Date(now.getTime() + fiveYearsMs);

  const virtualInstances = uniqueRows.flatMap((r) =>
    r.recurrenceRule ? expandRecurrence(r, windowFrom, windowTo) : []
  );

  const allRows = [...uniqueRows, ...virtualInstances];

  const totalPages = Math.ceil(total / PER_PAGE);

  const hasFilters = q || era || category || pubFilter || from || to;

  const buildFilterHref = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      q,
      era,
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
    <main className="max-w-6xl mx-auto px-5 py-12 sm:py-16">

      {/* ── Header ── */}
      <div className="mb-10">
        <p className="ps-eyebrow mb-3">Principia Synthesia</p>
        <h1 className="ps-display themed-heading" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
          Timeline
        </h1>
      </div>

      {/* ── Filter form ── */}
      <form method="GET" action="/timeline" className="mb-10">
        <div className="ps-action-bar gap-2">
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search events…"
            className="themed-input flex-1 min-w-32"
            style={{ fontSize: "0.875rem" }}
          />
          <input
            id="era"
            type="text"
            name="era"
            defaultValue={era ?? ""}
            placeholder="Era"
            className="themed-input w-32"
            style={{ fontSize: "0.875rem" }}
          />
          <input
            id="category"
            type="text"
            name="category"
            defaultValue={category ?? ""}
            placeholder="Category"
            className="themed-input w-32"
            style={{ fontSize: "0.875rem" }}
          />
          <input
            id="publisher"
            type="text"
            name="publisher"
            defaultValue={pubFilter ?? ""}
            placeholder="Publisher"
            className="themed-input w-32"
            style={{ fontSize: "0.875rem" }}
          />
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className="themed-input w-36"
            style={{ fontSize: "0.875rem" }}
          />
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className="themed-input w-36"
            style={{ fontSize: "0.875rem" }}
          />
          {activeView === "list" && (
            <input type="hidden" name="view" value="list" />
          )}
          <button
            type="submit"
            className="themed-btn-accent rounded-md shrink-0"
            style={{ fontSize: "0.8125rem", padding: "0.375rem 0.875rem" }}
          >
            Filter
          </button>
          {hasFilters && (
            <Link
              href="/timeline"
              className="themed-btn-ghost shrink-0"
              style={{ fontSize: "0.8125rem" }}
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {allRows.length === 0 ? (
        <p className="themed-muted">No events found.</p>
      ) : (
        <TimelineClientShell
          rows={allRows}
          activeView={activeView}
          q={q}
          era={era}
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
