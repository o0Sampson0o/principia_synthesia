# Feature Implementation Plan (Priorities 1–6)

This plan covers six features in the order most safely executed. Each section names
the exact existing files, tables, schemas, and helpers to reuse, and lists every new
file to create. Where two features touch the same surface (e.g. Feature 2 quotes
Feature 1's version hash, Feature 4 plugs into the existing `articleViews` table),
the dependency is called out explicitly.

**Cross-cutting infrastructure that does NOT yet exist** (built once, used by 3, 5, 6):
- An in-app notification system (no `notifications` table, no UI). Built as part of
  Feature 3, then reused by Features 5 and 6.
- A `marked-as-verified-at` concept on articles (built in Feature 3).
- A `forked_from` lineage field on articles (built in Feature 5).

**Cross-cutting infrastructure that DOES exist:**
- `articleViews` table already records per-render rows. Feature 4 extends it
  rather than creating a new view table.
- `revisions` table records every save's previous content. Feature 1 is a
  separate "publish snapshot" concept (not the same as revisions).
- `CRON_SECRET` + `/api/admin/cron/prune-views` already establish a cron-route
  pattern (Bearer-secret check). Feature 3 follows it.
- Modal pattern uses a plain `<div role="dialog" aria-modal="true">` overlay
  (see `components/InsertImageButton.tsx`). All new modals follow this pattern.
  Native `<dialog>` styles are owned in `app/globals.css` per the codebase rule.
- `sendEmail()` and the no-SMTP console-log fallback exist in `lib/email.ts`.
- Drizzle test-mock pattern: see `tests/actions/event-actions.test.ts` for the
  canonical scaffold (vi.hoisted mocks, drizzle-orm pass-through).

---

## Feature 1: Article Version Snapshots

### Overview

On every "publish" (i.e. a save where `metadata.status === "published"`),
write the article's current `content`, `metadata`, `title`, `summary`, and a
short content-hash tag into a new `article_snapshots` table. Public reads of
`/:publisher/articles/[slug]?v=HASH` load the frozen snapshot; reads without
`?v=` continue to serve the live `articles` row. A banner above the article
body announces when a versioned snapshot is being shown.

**Important — this is not the same as `revisions`:** `revisions` is the
edit-history audit trail (one row per save, regardless of status). Snapshots
are a publicly addressable, immutable, publish-time freeze. Keep both.

### Assumptions

- "Publish event" = a call to `updateArticle()` or `createArticle()` where the
  parsed `metadata.status === "published"` AND the new content differs from
  the previous (use the content hash to avoid duplicate snapshots on
  no-op republish). `updateArticleContent()` (used for section reorder
  only) does **not** create a snapshot — consistent with its precedent of
  not creating a revision.
- "Short hash" = first 7 hex chars of SHA-256 of `content || ""`. Seven matches
  the Git short-hash convention and avoids the visual ambiguity of 6 chars.
- Snapshots are append-only. No UI to delete or edit them. They cascade-delete
  with their parent article.
- `?v=HASH` matches against the **start** of `article_snapshots.contentHash`
  (prefix match), so we accept the short form. Ambiguous prefixes (multiple
  matches) → 404.
- Banner shows the snapshot's `publishedAt`, not the article's `updatedAt`.

### Schema Changes (`db/schema.ts`)

Add a new table after `articleViews`:

```ts
export const articleSnapshots = pgTable(
  "article_snapshots",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),           // full SHA-256 hex
    shortHash: text("short_hash").notNull(),               // first 7 chars (denormalised for query)
    title: text("title").notNull(),
    summary: text("summary"),
    content: text("content").notNull(),                    // full MDX as published
    metadata: jsonb("metadata").$type<ArticleMetadataShape>().notNull(),
    publishedAt: timestamp("published_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.articleId, t.contentHash),               // dedupe identical content
    index("article_snapshots_article_idx").on(t.articleId),
    index("article_snapshots_short_hash_idx").on(t.articleId, t.shortHash),
  ]
);
```

Then run `npx drizzle-kit generate` and `npx drizzle-kit migrate`.

### Server Actions / Helpers

**New file `lib/article-snapshots.ts`:**

```ts
export async function createSnapshotIfPublished(
  articleId: number,
  next: { title: string; summary: string | null; content: string; metadata: ArticleMetadataShape }
): Promise<{ created: boolean; shortHash: string | null }>
```

- Returns `{ created: false, shortHash: null }` if `next.metadata.status !== "published"`.
- Computes `contentHash = createHash("sha256").update(next.content).digest("hex")`.
- Inserts `articleSnapshots` row using `.onConflictDoNothing()` against the
  `(articleId, contentHash)` unique index (so re-publishing identical content
  is a silent no-op).
- Returns the short hash on success.

Also export:
```ts
export async function getSnapshotByShortHash(articleId: number, shortHash: string)
  : Promise<{ id: number; shortHash: string; title: string; summary: string | null;
              content: string; metadata: ArticleMetadataShape; publishedAt: Date } | null>
```
Uses `LIKE 'shortHash%'`-style prefix match. If two snapshots match the prefix
(very rare with 7 chars), returns `null` so the page renders 404 rather than
serving an ambiguous result.

**Modify `app/[publisher]/articles/actions.ts`:**

- In `createArticle()`: after the `insert`, call
  `createSnapshotIfPublished(article.id, { title, summary, content, metadata: parsed.metadata })`.
- In `updateArticle()`: after the existing `update(articles)`, call
  `createSnapshotIfPublished(validated.id, ...)`.
- `restoreRevision()`: also call `createSnapshotIfPublished()` (a restore that
  ends up published-status is a publish event).
- `updateArticleContent()`: do **NOT** snapshot (matches the existing
  "section reorder is structural, not a content edit" rule).

### Routes / Page Changes

**Modify `app/[publisher]/articles/[slug]/page.tsx`:**

- Read `searchParams` (also a `Promise<...>` in Next.js 16). Accept `v`.
- If `v` is set:
  1. Resolve the live article row as today (to get `articles.id` and to gate
     `canView`).
  2. Call `getSnapshotByShortHash(article.id, v)`. If `null`, `notFound()`.
  3. Override `title`, `summary`, `content`, and the `metadata`-derived
     downstream values from the snapshot row.
  4. Pass `viewingSnapshot={ shortHash, publishedAt }` to a new banner.
- If `v` is not set, render the live article exactly as today.
- The `articleViews` insert at line 59 should fire on both live and snapshot
  reads (a view is a view).

**New component `components/SnapshotBanner.tsx` (server component):**

```tsx
type Props = {
  publisherSlug: string;
  slug: string;
  shortHash: string;
  publishedAt: Date;
  latestUpdatedAt: Date;
};
```

Renders a yellow-tinted notice at the top of the article (use `themed-surface`
+ a `border-l-4` accent — match how `OfflineGuard` does its banner). Text:
> You are viewing version `<shortHash>` — published `<date>`.  
> [View latest version](`/:publisher/articles/:slug`)

Show only when `viewingSnapshot` is defined.

**New page `app/[publisher]/articles/[slug]/versions/page.tsx`:**

Optional but cheap: lists all snapshots for an article (short hash + date +
link to `?v=<short>`). Restrict to publisher editors via `canEditContent()`.
Keep it small — a single `<table>`, no client state. This unlocks Feature 2's
"Cite a specific version" flow.

### Tests

- `tests/lib/article-snapshots.test.ts` (node env) — covers
  `createSnapshotIfPublished` (skipped when not published, deduped on
  identical hash, short hash truncation) and `getSnapshotByShortHash`
  (prefix match, ambiguous prefix → null). Mock `db` per the
  `tests/actions/event-actions.test.ts` pattern.
- Extend `tests/actions/` with `article-snapshot-on-publish.test.ts`
  (node env) — verify that `updateArticle()` invokes the snapshot helper
  with the correct shape when status is published and skips it otherwise.

### Dependencies

- None on prior features.
- Provides the `shortHash` consumed by **Feature 2** (citation generator),
  and the per-version URL consumed by Feature 2's "Cite this version" button.

---

## Feature 2: Formal Citation Generator

### Overview

A "Cite this article" button on every public article page opens a modal with
four tabs: APA, MLA, Chicago, BibTeX. Each tab shows a pre-formatted citation
string, plus a "Copy" button. If the user is viewing a snapshot (`?v=…`), the
citation includes the version hash and the snapshot's `publishedAt`.

### Assumptions

- "Author" = the resolved publisher's `displayName`. For org publishers, the
  org name is the author. (We have no per-article author override field.)
- "Published date" = the article's `updatedAt` for live views, or
  `articleSnapshots.publishedAt` for snapshot views. (`createdAt` is too
  noisy for citations; `updatedAt` reflects the most recent publish.)
- "Accessed date" = today's date — computed at render time on the client
  inside the modal so it stays fresh.
- The site URL base comes from the `Host` header at SSR — simplest is to
  hard-code `https://principia-synthesia.com` (or read `NEXT_PUBLIC_SITE_URL`
  if set) inside the formatter and let SSR pass it down.
- BibTeX cite key: `lastNameSlugYear` slugified, falling back to the
  publisher slug + first slug-word of the article slug.

### Schema Changes

**None.** Pure derivation from existing data.

### Validation Schemas

No Zod schemas needed — purely client-rendered output.

### Server Actions

None — formatting is deterministic and pure. All logic lives in `lib/citations.ts`.

### New Files

**`lib/citations.ts`** — pure functions:

```ts
export type CitationInput = {
  authorDisplayName: string;
  authorPublisherSlug: string;
  title: string;
  publishedAt: Date;       // updatedAt of live article OR snapshot.publishedAt
  url: string;             // full canonical URL incl ?v=… when snapshot
  versionHash: string | null;
  accessedAt: Date;
};

export function formatAPA(input: CitationInput): string;
export function formatMLA(input: CitationInput): string;
export function formatChicago(input: CitationInput): string;
export function formatBibTeX(input: CitationInput): string;
```

Examples (formats are deterministic):
- APA: `Author, A. (YYYY). Title. Principia Synthesia. https://…  (version abc1234, accessed 2026-05-24)`
- MLA: `Author. "Title." *Principia Synthesia*, DD Mon YYYY, https://… Accessed DD Mon YYYY.`
- Chicago: `Author. "Title." Principia Synthesia. Modified DD Mon YYYY. https://…`
- BibTeX: A standard `@misc{key, author={...}, title={{...}}, year={YYYY}, url={...}, note={Accessed YYYY-MM-DD}, urldate={YYYY-MM-DD}, version={abc1234}}`

**`components/CitationModal.tsx`** (`"use client"`):

- Props: `CitationInput` minus `accessedAt` (computed client-side via
  `useState(() => new Date())`).
- State: `activeTab: "apa" | "mla" | "chicago" | "bibtex"`, `copied: boolean`.
- Modal markup follows `components/InsertImageButton.tsx` pattern
  (`role="dialog"`, `aria-modal="true"`, click-outside closes).
- Copy button calls `navigator.clipboard.writeText()` and flashes "Copied!"
  for 1.5s.
- Uses `themed-surface`, `themed-btn-primary`, `themed-btn-ghost`.

**`components/CiteButton.tsx`** (`"use client"`, thin wrapper):

- Receives `CitationInput`-minus-`accessedAt` as a JSON-serialisable prop.
- Renders a `<button>` that opens `<CitationModal />`.

### UI Integration

**Modify `app/[publisher]/articles/[slug]/page.tsx`:**

Beneath the existing "Edit" link (line 113-122 area), unconditionally render
`<CiteButton input={...} />`. Compute on the server:

```ts
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://principia-synthesia.com";
const canonicalUrl = `${siteUrl}/${publisherSlug}/articles/${slug}${searchParams.v ? `?v=${searchParams.v}` : ""}`;
```

Pass into the prop. When `v` is present, also pass `versionHash: searchParams.v`
and `publishedAt: snapshot.publishedAt`. When `v` is absent, pass
`versionHash: null` and `publishedAt: article.updatedAt ?? article.createdAt`.

### Tests

- `tests/lib/citations.test.ts` (any env) — golden-string tests for each
  formatter against a fixed input. Cover both with-version and
  without-version cases.
- `tests/components/CitationModal.test.tsx` (jsdom) — verifies tab switching
  and that the copy button calls `navigator.clipboard.writeText` (mocked via
  `Object.assign(navigator, { clipboard: { writeText: vi.fn() } })`).

### Dependencies

- **Feature 1** (snapshots) — citations against a snapshot URL include the
  short hash. Without Feature 1, just omit the version field. Feature 2 can
  ship before Feature 1 if you wire `versionHash: null` everywhere; rewire
  later. Recommended: ship Feature 1 first.

---

## Feature 3: "Last Verified" Date + Author Staleness Nudge

### Overview

Three pieces:
1. Add `lastVerifiedAt` to `articles` (set on publish AND on explicit
   "mark as verified" action).
2. Display "Last verified: …" near the article header.
3. Weekly cron compares `lastVerifiedAt` against a threshold (default
   180 days) and, for each stale article, writes one in-app notification to
   the article's author and surfaces a soft banner to readers.

This feature **also introduces the notification system** that Features 5 and
6 build on. Notifications are stored in the DB and rendered in a
"Notifications" dropdown on the nav bar. Email is best-effort via `sendEmail`.

### Assumptions

- "Author" of a user-owned article = `articles.ownerId` (the owning user).
  Org-owned articles: notify each user with `super_admin` or `admin` role in
  that org. (For staleness, "author" is whoever can edit. Use
  `canEditContent`-eligible users.)
- "Stale threshold" = configurable via `STALE_ARTICLE_DAYS` env var; default 180.
- Reader-facing banner shows if `Date.now() - lastVerifiedAt > thresholdDays`,
  but only on `status === "published"` articles (drafts shouldn't nag).
- Existing legacy articles get `lastVerifiedAt = articles.updatedAt` via the
  migration's `DEFAULT updatedAt` clause — backfill in the same SQL migration.
- A notification is "delivered" when the cron writes the row. Marking as
  read is a separate user action. The cron must dedupe: if there is already
  an unread `stale_article` notification for that user/article pair, don't
  write another.

### Schema Changes (`db/schema.ts`)

**1. Add column to `articles`:**

```ts
// In articles pgTable:
lastVerifiedAt: timestamp("last_verified_at").defaultNow(),
```

After `drizzle-kit generate`, hand-edit the migration to backfill:
```sql
UPDATE articles SET last_verified_at = updated_at WHERE last_verified_at IS NULL;
```

**2. Add `notifications` table** (new):

```ts
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),         // 'stale_article' | 'article_forked' | 'article_cited'
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("notifications_user_unread_idx").on(t.userId, t.readAt),
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
  ]
);
```

The `type` is a free-text enum. We will not enforce values at the DB level
to keep new notification types from requiring migrations. Each `type` has its
own well-known payload shape, documented in `lib/notifications.ts`.

### Validation Schemas (`lib/validations.ts`)

```ts
export const markArticleVerifiedSchema = z.object({
  articleId: z.coerce.number().int().positive(),
  publisherSlug: z.string().min(1),
});

export const markNotificationReadSchema = z.object({
  notificationId: z.coerce.number().int().positive(),
});

export const markAllNotificationsReadSchema = z.object({});
```

### Server Actions

**Add to `app/[publisher]/articles/actions.ts`:**

```ts
export async function markArticleVerified(publisherSlug: string, formData: FormData)
```

- Auth via `assertEditRights(publisherSlug)`.
- Validate with `markArticleVerifiedSchema`.
- `UPDATE articles SET last_verified_at = NOW() WHERE id = $1` (no revision).
- `revalidatePath(...)` and return `{ ok: true }` (no redirect — the caller
  is a small form on the article page that uses `useFormStatus`).

Also: in `updateArticle()` and `createArticle()`, when
`metadata.status === "published"`, set `lastVerifiedAt: new Date()` in the same
`UPDATE`/`INSERT`. Republishing always resets the staleness clock.

**New file `app/notifications/actions.ts`:**

```ts
export async function markNotificationRead(formData: FormData)
export async function markAllNotificationsRead()
```

Both verify `requireSession()` and that `notifications.userId === session.userId`
before updating `readAt = NOW()`.

**New helper `lib/notifications.ts`:**

```ts
export type NotificationType = "stale_article" | "article_forked" | "article_cited";
export type StaleArticlePayload = { articleId: number; slug: string; publisherSlug: string; title: string };
export type ArticleForkedPayload = { forkedArticleId: number; forkerPublisherSlug: string; originalSlug: string; originalTitle: string };
export type ArticleCitedPayload = { citingArticleId: number; citingPublisherSlug: string; citingSlug: string; citingTitle: string; citedSlug: string };

export async function notify(
  userId: number,
  type: NotificationType,
  payload: StaleArticlePayload | ArticleForkedPayload | ArticleCitedPayload
): Promise<void>

export async function notifyWithDedupe(
  userId: number,
  type: NotificationType,
  payload: StaleArticlePayload | ArticleForkedPayload | ArticleCitedPayload,
  dedupeKey: (p: typeof payload) => string  // e.g. `articleId:${p.articleId}`
): Promise<void>
```

`notifyWithDedupe` looks for an existing **unread** notification with the same
`type` and a matching field inside `payload`; skips insert if found. The cron
uses this. Features 5 and 6 use `notify` directly (no dedupe needed — every
fork or citation is a discrete event).

### API Routes

**New file `app/api/admin/cron/check-stale-articles/route.ts`:**

Mirror `app/api/admin/cron/prune-views/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { articles, users, orgMemberships } from "@/db/schema";
import { sql, eq, and } from "drizzle-orm";
import { notifyWithDedupe } from "@/lib/notifications";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const threshold = Number(process.env.STALE_ARTICLE_DAYS ?? "180");

  // Find published articles whose lastVerifiedAt is older than threshold.
  // Filter on metadata.status = 'published' via jsonb operator.
  const stale = await db.execute(sql`
    SELECT a.id, a.slug, a.title, a.owner_type, a.owner_id, p.slug AS publisher_slug
    FROM articles a
    JOIN publishers p ON
      (a.owner_type = 'user' AND p.user_id = a.owner_id) OR
      (a.owner_type = 'org'  AND p.org_id  = a.owner_id)
    WHERE a.is_internal = false
      AND a.metadata->>'status' = 'published'
      AND a.last_verified_at < NOW() - (${threshold}::int * INTERVAL '1 day')
  `);

  let notified = 0;
  for (const row of stale.rows ?? stale) {
    const recipients = await resolveAuthors(row.owner_type, row.owner_id);
    for (const userId of recipients) {
      await notifyWithDedupe(
        userId,
        "stale_article",
        { articleId: row.id, slug: row.slug, publisherSlug: row.publisher_slug, title: row.title },
        (p) => `articleId:${(p as any).articleId}`
      );
      notified++;
    }
  }

  return NextResponse.json({ checked: stale.length, notified });
}
```

`resolveAuthors(ownerType, ownerId)`:
- `"user"` → `[ownerId]`.
- `"org"` → all `orgMemberships.userId` where `orgId = ownerId AND role IN ('admin', 'super_admin')`.

**Update `vercel.json`** (create file if it doesn't exist):

```json
{
  "crons": [
    { "path": "/api/admin/cron/prune-views", "schedule": "0 3 * * 0" },
    { "path": "/api/admin/cron/check-stale-articles", "schedule": "0 4 * * 1" }
  ]
}
```

(Monday 04:00 UTC — non-overlapping with the existing Sunday job.)

### UI Components

**New `components/LastVerifiedBadge.tsx`** (server component):

Renders subtly under the existing date row in the article header
(`app/[publisher]/articles/[slug]/page.tsx`):

```
Last verified: Mar 12, 2026
```

If the article is stale (older than threshold), additionally render a soft
amber banner below the header:

```
This article hasn't been verified by its author in over 6 months. Information
may be out of date.
```

Use `themed-surface` + an amber `border-l-4`. Read the threshold from the
same env var (`STALE_ARTICLE_DAYS`).

**New `components/MarkVerifiedForm.tsx`** (`"use client"`):

A single-button form (`useFormStatus`) shown only to editors at the bottom of
the article header. POSTs to `markArticleVerified`.

**New `components/NotificationsBell.tsx`** (`"use client"`):

Lives in `components/NavClient.tsx`. Renders a bell icon with an unread
count badge. On click opens a dropdown listing the 10 most recent
notifications. Each row is a `<Link>` to the relevant target (article URL
for `stale_article`/`article_forked`/`article_cited`) with a per-row
"Mark read" form. Bottom row: "Mark all as read" and a link to
`/notifications` for the full list.

The unread count is fetched on mount via a small client-side `fetch("/api/notifications/unread-count")`. Add that GET route:

**New `app/api/notifications/unread-count/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ count: 0 });
  const [row] = await db.select({ c: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, session.userId), isNull(notifications.readAt)));
  return NextResponse.json({ count: row?.c ?? 0 });
}
```

**New page `app/notifications/page.tsx`** (server component):

`max-w-4xl` container. Lists all notifications for the current session, most
recent first, with per-row "Mark read" and "Mark all read" forms. Use
`requireSession()` to gate.

**Stale-articles list on the author dashboard:**

Add a "Stale articles" section to `app/[publisher]/page.tsx` (the publisher
hub), visible only when `isOwner` is true. Query: published, non-internal,
owned by this publisher, with `lastVerifiedAt < NOW() - threshold`. Render as
`<ul>` of `<Link>` items each next to a `<MarkVerifiedForm>`.

### Tests

- `tests/lib/notifications.test.ts` (node env) — covers `notify` insert and
  `notifyWithDedupe` skip-when-exists behaviour.
- `tests/actions/article-verify-action.test.ts` (node env) — `markArticleVerified`
  updates `lastVerifiedAt` and respects `assertEditRights`.
- `tests/actions/notification-actions.test.ts` (node env) — read/mark-all-read
  scoped to the current user.
- `tests/api/cron-check-stale-articles-route.test.ts` (node env) — 401 without
  bearer, runs the query and fires `notifyWithDedupe` per stale row; mock the
  helper.

### Dependencies

- **Builds the notification system** consumed by Features 5 and 6.
- No upstream feature dependencies.

---

## Feature 4: Author Analytics Dashboard

### Overview

Reuse the existing `articleViews` row-per-render table. Add columns for
referrer and an anonymised session ID. Build an `/:publisher/analytics`
dashboard for editors that shows per-article totals, unique-by-session counts,
a daily time-series chart (last 30/90 days), and traffic-source breakdown
(Direct / Search / Social / Internal / External) computed from the referrer.

### Assumptions

- "Unique view" = distinct `sessionId` per `articleId`. The session ID is a
  random 16-byte token stored in a 30-day `aview_sid` httpOnly cookie. No
  account linkage. (This satisfies "anonymized session".)
- "Internal" source = referrer is the same host as the site
  (`NEXT_PUBLIC_SITE_URL`).
- "Social" host list is hard-coded in `lib/analytics-source.ts`
  (twitter/x, facebook, linkedin, reddit, news.ycombinator, t.co, lnkd.in,
  fb.me, instagram, mastodon.*, bsky.app).
- "Search" host list: google, bing, duckduckgo, yandex, baidu, brave.
- Anything else with a hostname → "External". Empty referrer → "Direct".
- Charts are rendered with inline SVG (no chart library — avoids a new CSP
  exception and a heavy dep). One simple bar chart and one line chart are
  cheap to handcraft.
- Existing `articleViews` rows have NULL referrer/sessionId — that's fine.
  They count toward "total views" but not toward "unique" (since NULL ≠ NULL).

### Schema Changes (`db/schema.ts`)

Extend `articleViews`:

```ts
export const articleViews = pgTable(
  "article_views",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at").defaultNow().notNull(),
    referrer: text("referrer"),              // raw Referer header, max 2k truncated in code
    referrerSource: text("referrer_source"), // 'direct' | 'search' | 'social' | 'internal' | 'external'
    sessionId: text("session_id"),           // 32-hex-char anonymous token, NULL for legacy rows
  },
  (t) => [
    index("article_views_article_viewed_idx").on(t.articleId, t.viewedAt),
    index("article_views_article_session_idx").on(t.articleId, t.sessionId),
  ]
);
```

`drizzle-kit generate` produces an additive migration; legacy rows keep NULLs.

### Server Actions / Helpers

**New file `lib/analytics-source.ts`:**

```ts
export type ReferrerSource = "direct" | "search" | "social" | "internal" | "external";
export function classifyReferrer(referrer: string | null, siteHost: string): ReferrerSource;
```

Pure function. Heavily testable.

**New file `lib/analytics-session.ts`:**

```ts
export async function getOrCreateSessionId(): Promise<string>;
```

Reads `aview_sid` cookie via `next/headers cookies()`. If absent, mints a
32-hex-char random ID via `crypto.randomBytes(16).toString("hex")` and writes
the cookie with `httpOnly`, `sameSite: "lax"`, `secure: true` in prod,
30-day `maxAge`.

**Modify `app/[publisher]/articles/[slug]/page.tsx`:**

Replace the existing fire-and-forget insert:

```ts
db.insert(articleViews).values({ articleId: article.id }).catch(() => {});
```

with:

```ts
const referrer = (await headers()).get("referer");
const sessionId = await getOrCreateSessionId();
const siteHost = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://principia-synthesia.com").host;
db.insert(articleViews).values({
  articleId: article.id,
  referrer: referrer?.slice(0, 2000) ?? null,
  referrerSource: classifyReferrer(referrer, siteHost),
  sessionId,
}).catch(() => {});
```

Apply the same change to the chapter page `app/[publisher]/books/[bookSlug]/[chapter]/page.tsx` if it also records views (audit before assuming).

**New file `lib/analytics-queries.ts`:**

Pure DB helpers (server-only) used by the dashboard page:

```ts
export async function getPerArticleStats(ownerType, ownerId): Promise<Array<{
  articleId: number;
  slug: string;
  title: string;
  totalViews: number;
  uniqueViews: number;        // COUNT DISTINCT sessionId
  last30dViews: number;
}>>

export async function getDailyViews(articleId: number, days: number)
  : Promise<Array<{ day: string /* YYYY-MM-DD */; views: number }>>

export async function getSourceBreakdown(articleId: number, days: number)
  : Promise<Record<ReferrerSource, number>>
```

All implemented with Drizzle + `sql` template fragments for date_trunc.

### Routes

**New page `app/[publisher]/analytics/page.tsx`** (server component):

- `params: Promise<{ publisher: string }>` → resolve publisher → check
  `canEditContent()` → 404 otherwise.
- Fetch `getPerArticleStats(...)`.
- Render a table: Title | Total | Unique | Last 30d | "View detail" link.
- Top-of-page summary cards: total views across all articles in 30d, total
  unique sessions, top referrer source.

**New page `app/[publisher]/analytics/[slug]/page.tsx`:**

- Drill-down for one article.
- Fetch `getDailyViews(articleId, 30)` and `getSourceBreakdown(articleId, 30)`.
- Render two inline-SVG charts (`components/SparklineSvg.tsx` and
  `components/SourceBarSvg.tsx`).

### CSP Considerations

Inline `<svg>` elements rendered by server components are not a CSP issue
(SVG isn't `script-src` controlled, and the SVG paths/text we generate are
static). No CSP changes required.

### Tests

- `tests/lib/analytics-source.test.ts` — table-driven test of `classifyReferrer`:
  null → direct, google.com → search, twitter.com → social, our own host →
  internal, anything else → external.
- `tests/lib/analytics-queries.test.ts` (node env) — Drizzle mocks for each
  query helper. Use the standard pattern from `tests/actions/event-actions.test.ts`.

### Dependencies

- Extends existing `articleViews` table — DO NOT create a new table.
- Reuses existing cron `prune-views` for cleanup (no change needed; row count
  per article grows but the 90-day prune still works).
- No dependency on other priority features.

---

## Feature 5: Article Forking with Lineage Attribution

### Overview

A "Fork this article" button on every public article. Clicking it
(authenticated only) creates a new article in the forker's own publisher
account with `forkedFromId` set to the source. Forked articles render with a
small server-side header "Forked from [original by author]" that is **not**
part of the editable MDX — it's enforced layout. The original article page
shows a fork count and a (paginated) list of forks.

The fork creator gets a notification via the system built in Feature 3.

### Assumptions

- Forking is allowed only for articles the user can `canView()` (so private
  articles only fork-able by people who have grants).
- Forked article slug: `original-slug-fork-<n>` where `<n>` increments to
  avoid collisions inside the forker's publisher.
- Forked article `metadata.status` is reset to `"draft"` (forker hasn't
  endorsed it yet).
- Forked articles inherit `content`, `summary`, `title`, `metadata.tags`,
  `metadata.canvas`. They do NOT inherit categories — categories are added
  by the forker.
- Org-owned articles can be forked: the forker becomes the new article's
  owner (their personal user publisher, not their org — keep it simple).
- A user who forks their own article still gets the lineage banner.
- Notification recipient is the source article's "author" using the same
  `resolveAuthors()` rule as Feature 3 (user owner → that user; org owner →
  super_admins + admins of that org).

### Schema Changes (`db/schema.ts`)

Add column to `articles`:

```ts
forkedFromId: integer("forked_from_id").references((): AnyPgColumn => articles.id, {
  onDelete: "set null",
}),
```

(Use `(): AnyPgColumn` self-reference to avoid the TS forward-ref issue, see
Drizzle docs.)

Add an index for the fork-count and fork-list queries:

```ts
index("articles_forked_from_idx").on(t.forkedFromId)
```

### Validation Schemas (`lib/validations.ts`)

```ts
export const forkArticleSchema = z.object({
  sourcePublisherSlug: z.string().min(1),
  sourceArticleSlug: articleSlugSchema,
});
```

### Server Actions

**New file `app/[publisher]/articles/fork-action.ts`** (kept separate from
the publisher-scoped `actions.ts` because the fork target isn't necessarily
the URL's publisher):

```ts
"use server";

export async function forkArticle(formData: FormData)
```

- `requireSession()` (forking requires login).
- Validate `forkArticleSchema`.
- Resolve source publisher and source article. `canView()` on source.
- Determine forker's target publisher: their own user publisher (`session.userSlug`).
- Generate target slug: start with source slug, append `-fork`, increment
  trailing `-N` if collision (loop with a `SELECT` until unused — bounded by
  10 retries; throw on exhaustion).
- Insert new article with `ownerType: "user"`, `ownerId: session.userId`,
  `forkedFromId: source.id`, status forced to `"draft"`.
- Call `notify(authorUserId, "article_forked", { forkedArticleId, forkerPublisherSlug, originalSlug, originalTitle })`
  for each resolved author of the source.
- `revalidatePath(...)` for the source and the forker's profile.
- `redirect()` to the new article's edit page.

### UI Components

**New `components/ForkButton.tsx`** (`"use client"`):

- Props: `sourcePublisherSlug`, `sourceArticleSlug`, `isAuthenticated`.
- If not authenticated: `<Link href="/login">Fork (sign in)</Link>`.
- Otherwise: a `<form action={forkArticle}>` with two `<input type="hidden">`
  fields and a submit button. Use `useFormStatus` for the loading state.

**New `components/ForkLineageHeader.tsx`** (server component):

Renders above the article body (inside the `<article>` container but above
`<MDXRemote>`) when `article.forkedFromId !== null`:

```
This article is forked from "<originalTitle>" by <originalAuthorDisplayName>
[link to original →]
```

Use `themed-surface` + `border-l-4`. Style intentionally distinct from
editable content. It is rendered by `app/[publisher]/articles/[slug]/page.tsx`,
not derived from MDX.

**New `components/ForksList.tsx`** (server component):

Lists forks of the current article. Title links to each fork's URL. Show
"… and N more forks" if the list is truncated at 10.

### Page Integration

**`app/[publisher]/articles/[slug]/page.tsx`:**

1. When loading the article, also fetch:
   - If `forkedFromId` is non-null: source article (id, slug, title) and
     source publisher's `displayName` and `slug`.
   - Fork count + first 10 forks of this article.
2. If forked, render `<ForkLineageHeader ... />` after the header, before
   the body.
3. Below `<RelatedEvents />` (or in a sidebar slot), render `<ForksList ... />`
   if the fork count > 0.
4. Render `<ForkButton ... />` next to `<CiteButton ... />`.

### Tests

- `tests/actions/fork-action.test.ts` (node env) — happy path, slug
  collision retry, `canView` denial.
- `tests/components/ForkLineageHeader.test.tsx` (jsdom) — renders nothing
  when `forkedFromId === null`, renders link when set.

### Dependencies

- **Feature 3** (notifications) — uses `notify("article_forked", ...)`. If
  Feature 3 hasn't shipped, swallow the notify call behind a feature flag or
  no-op. Recommend shipping 3 first.
- Independent of Features 1, 2, 4, 6.

---

## Feature 6: Internal Citation Linking Between Articles

### Overview

Add a `<Cite slug="publisher/article-slug" />` MDX component. At render time
it produces a numbered footnote superscript (`[1]`, `[2]`, …) inline, and a
bibliography section at the bottom of the article. Citations also write
relationship rows into a new `article_citations` table, and notify the cited
article's author on save.

### Assumptions

- Citation syntax: `<Cite slug="publisher/article-slug" />`. The `slug` prop
  is the same dotted form used by wikilinks but in `publisher/article-slug`
  form (matches the existing URL structure). We will be strict — reject
  malformed values with a visible "[invalid citation]" output rather than
  silently dropping.
- A citation to an unknown or non-public article still renders the superscript
  with "[?]" text (not "[1]") and shows up as "missing" in the bibliography.
- The same `slug` cited twice in one article gets the same number (deduped).
- Relationships are recomputed on every save: `updateArticle()` (and friends)
  parse the saved MDX, extract all `<Cite>` slugs, and replace the rows in
  `article_citations` for that source article. (Stale rows are wiped each
  save, simpler than diffing.)
- Notify the cited author **only** when a citation is newly added to the row
  set (i.e. wasn't in the previous row set). Avoid re-notifying on every
  edit.

### Schema Changes (`db/schema.ts`)

```ts
export const articleCitations = pgTable(
  "article_citations",
  {
    id: serial("id").primaryKey(),
    citingArticleId: integer("citing_article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    citedArticleId:  integer("cited_article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),  // order within the citing article (0-based)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.citingArticleId, t.citedArticleId),  // dedupe; one row per cited target
    index("article_citations_citing_idx").on(t.citingArticleId),
    index("article_citations_cited_idx").on(t.citedArticleId),
  ]
);
```

### Validation Schemas (`lib/validations.ts`)

```ts
export const citationSlugSchema = z.string().regex(
  /^[a-z0-9-]+\/article-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "Citation slug must be 'publisher/article-slug'"
);
```

### Helpers

**New file `lib/citations-extract.ts`:**

```ts
// Regex-based extraction (cheap; runs on every save). MDX parsing is overkill.
export function extractCitationSlugs(mdx: string): string[] {
  const out: string[] = [];
  const re = /<Cite\b[^>]*\bslug\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/g;
  let m;
  while ((m = re.exec(mdx))) {
    out.push(m[1].trim());
  }
  return Array.from(new Set(out));  // dedupe, preserve order
}
```

**New file `lib/citations-sync.ts`:**

```ts
export async function syncArticleCitations(
  citingArticleId: number,
  mdx: string
): Promise<{ added: number[]; removed: number[] }>
```

- Extract slugs via `extractCitationSlugs`.
- Resolve each `publisher/article-slug` to an `articleId` (one batch query).
  Unresolvable slugs are skipped.
- Read existing rows for `citingArticleId`.
- Compute set diff: `added` (in new, not in old) and `removed` (in old, not in new).
- Delete removed rows; insert added rows with sequential `position`.
- Return `{ added, removed }` so the caller can fire notifications.

### Server Action Wiring

**Modify `app/[publisher]/articles/actions.ts`:**

- In `updateArticle()` and `createArticle()`: after the article INSERT/UPDATE,
  call `syncArticleCitations(articleId, content ?? "")`. For each id in
  `added`, fire `notify(authorOfCited, "article_cited", { ... })` using the
  same `resolveAuthors` helper as Features 3 and 5. Do NOT notify on `removed`
  (a citation removal isn't actionable).

### MDX Component & Rendering Pipeline

**New file `lib/mdx-cite-numbering.ts`:**

A small helper used at render time:

```ts
export function buildCitationIndex(mdx: string)
  : { slugToNumber: Map<string, number>; orderedSlugs: string[] }
```

Pure scan of the MDX source (same regex as above) to assign deterministic
numbers in first-appearance order.

**New file `components/Cite.tsx`** (server component):

```tsx
type Props = { slug: string };
export default function Cite({ slug }: Props) {
  // Lookup happens via context: index is computed once per page render in
  // ArticlePage and stuffed into a Map. The Cite component reads from a
  // module-level Map keyed by the article's id (passed via React context).
}
```

Because MDX components can't receive non-prop data trivially, the cleanest
approach is:

1. In `app/[publisher]/articles/[slug]/page.tsx`, compute `slugToNumber` from
   the rendered body BEFORE `<MDXRemote>` runs.
2. Wrap the MDX in a React Context provider:
   ```tsx
   <CitationContext.Provider value={{ slugToNumber, resolved: resolvedMap }}>
     <MDXRemote ... components={{ Cite, ... }} />
   </CitationContext.Provider>
   ```
3. `<Cite>` reads from the context to render the right superscript and to know
   if the target was resolvable.

**New file `lib/citation-context.tsx`:**

```tsx
"use client";   // Context needs the client boundary for React 19 RSC
export const CitationContext = createContext<{
  slugToNumber: Map<string, number>;
  resolved: Map<string, { title: string; href: string }>;
}>(...);
```

Note: Because `MDXRemote` runs server-side in RSC mode, the cleanest pure-
server approach is to instead resolve everything inline and pass props
through a higher-order wrapper component generated at render time. **Simpler
alternative**: do the resolution server-side and inject a pre-computed
`numberByPosition` integer as a prop. Implementation note: prefer to skip
context altogether and instead transform the MDX with a remark plugin —
`remarkCiteNumbering` — that rewrites each `<Cite slug="..."/>` into
`<Cite slug="..." number={N} resolvedTitle="..." resolvedHref="..." />` (an
mdxJsxFlowElement node). This makes `<Cite>` a pure presentational component
and avoids cross-realm context propagation in RSC.

**Recommended: build `lib/remark-cite-numbering.ts`** modelled on
`lib/remark-wikilinks.ts`. It accepts an option object with the resolved-slug
map and rewrites each `<Cite>` MDX JSX element.

**New file `components/BibliographySection.tsx`** (server component):

Rendered after the MDX body when `orderedSlugs.length > 0`. Lists each
citation by number, linking to the cited article.

### Page Integration

**`app/[publisher]/articles/[slug]/page.tsx`:**

1. Before `<MDXRemote>`: extract slugs from the body, batch-resolve them via
   one query joining `publishers` and `articles`, build `slugToNumber` and
   `resolvedMap`.
2. Pass `remarkCiteNumbering` (with the resolved map) into `remarkPlugins`.
3. Add `Cite` to the `components` prop.
4. After `<MDXRemote>`, render `<BibliographySection orderedSlugs={...} resolved={resolvedMap} />`.

### CSP Considerations

No new dependencies, no inline scripts, no external network calls — CSP
unchanged.

### Tests

- `tests/lib/citations-extract.test.ts` — extraction handles single-slug,
  multi-slug, dedupe, self-closing vs paired tags, attribute whitespace.
- `tests/lib/citations-sync.test.ts` (node env) — Drizzle mocks; verifies
  diff logic and that `notify` is called for added IDs only.
- `tests/lib/remark-cite-numbering.test.ts` — pass MDX through unified
  pipeline with the plugin and assert the resulting JSX attributes.

### Dependencies

- **Feature 3** (notifications) — uses `notify("article_cited", ...)`. Hard
  dependency if you want the notification arm shipped. The Cite rendering
  itself is independent.
- Independent of Features 1, 2, 4, 5.

---

## Execution Order

The order below minimises rework and keeps every PR self-shippable.

1. **Feature 3** (Last Verified + Notifications + Cron pattern) — first because
   it builds the in-app notification system that Features 5 and 6 plug into.
   The new `notifications` table and `lib/notifications.ts` are foundational.
   Also adds the `vercel.json` cron entry that establishes the multi-cron
   pattern.

2. **Feature 1** (Article Version Snapshots) — independent, additive
   table + page logic. Ship before Feature 2 so Feature 2 can cite specific
   versions without rework.

3. **Feature 2** (Citation Generator) — pure derivation + UI on top of
   Feature 1. No DB changes.

4. **Feature 4** (Author Analytics Dashboard) — extends `articleViews` with
   non-destructive new columns. Independent of all other features. Ship in
   parallel with Feature 1 or 2 if there are multiple agents.

5. **Feature 5** (Article Forking) — adds `articles.forkedFromId` and a new
   action. Depends on Feature 3 for the "your article was forked" notification.

6. **Feature 6** (Internal Citations) — adds `articleCitations` table,
   remark plugin, MDX `<Cite>` component. Depends on Feature 3 for the
   "your article was cited" notification. Slightly higher complexity than
   the others (MDX/remark integration), so ship last.

**Migration safety:** Features 1, 3, 4, 5, 6 each add net-new tables or
nullable columns. None are destructive. Run `npx drizzle-kit generate`
**after each feature's schema change**, eyeball the generated SQL, and check
in one migration per feature. Resist batching schema changes — small
migrations are reversible.

**Feature flag rollout:** Add an optional `NEXT_PUBLIC_ENABLE_NOTIFICATIONS`
env var that, when unset, hides the `<NotificationsBell />` and the
`/notifications` page. This lets Feature 3's backend ship without surfacing
incomplete UX during development.

**Common-pitfall checklist** (applies to every feature):
- `params` and `searchParams` in App Router pages are `Promise<...>` in
  Next.js 16. Always `await` them.
- Files using `jose` (none new here, but stay alert) require the node Vitest env.
- Drizzle test mocks need `vi.hoisted()` per `tests/actions/event-actions.test.ts`.
- Redirects throw `NEXT_REDIRECT` — assert with `.rejects.toThrow("NEXT_REDIRECT")`.
- Modal styles for `<dialog>` must live in `app/globals.css` (the project rule).
  All new modals in this plan use `<div role="dialog">` overlays — no `<dialog>`
  — so the rule doesn't bite here, but watch for it if you switch.
- Server-actions used inside `<form action={...}>` from a client component
  must be exported from a `"use server"` file — keep the pattern of dedicated
  `actions.ts` files.
- The CSP policy (see `middleware.ts:6-28`) has no `connect-src` for arbitrary
  hosts. The unread-count fetch in Feature 3 is same-origin, so it's fine. Do
  NOT introduce any third-party JS library that calls out to external hosts
  without first widening CSP.
