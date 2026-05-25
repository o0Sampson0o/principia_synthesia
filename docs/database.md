# Database

PostgreSQL via Drizzle ORM. `db/index.ts` exports the `db` client. Schema in `db/schema.ts`.

## Tables

`publishers`, `users`, `organizations`, `orgMemberships`, `books`, `articles`, `revisions`, `categories`, `articleCategories`, `curriculumEntries`, `userThemes`, `bookSnapshots`, `bookSnapshotEntries`, `pdfCaches`, `resourceVisibility`, `accessGrants`, `objects`, `articleViews`, `events`, `eventArticles`, `articleSnapshots`, `notifications`, `articleCitations`

## Publisher model

All content (articles, books, objects) is owned by a publisher — either a user or an org — identified by `ownerType` (`"user"` | `"org"`) and `ownerId` (FK to `users.id` or `organizations.id`). The `publishers` table enforces globally unique slugs across users and orgs. Each user and org has a `publisherSlug` denormalised field.

## Books

`books` is an explicit table (slug, title, ownerType, ownerId). Slugs are unique per publisher. `curriculumEntries` references `books.id` via a `bookId` FK. `bookSnapshots` and `pdfCaches` also use `bookId`. Deleting a book cascades to entries, snapshots, and PDF cache. Internal articles owned by a book are cascade-deleted via `parentBookId` FK.

## Articles

`articles.parentBookId` (FK → `books.id`) identifies which book owns an internal article (replaces the old `parentBookSlug` text column). `articles.isInternal` marks internal articles. `articles.metadata` (JSONB) stores parsed frontmatter so it's queryable without re-parsing.

Two new columns:
- `last_verified_at` — timestamp reset by the `markArticleVerified` action. Defaults to `now()` on insert. Used by the staleness cron to determine whether to send a nudge notification.
- `forked_from_id` — self-referential FK (→ `articles.id`, `onDelete: set null`). Set when an article is created via `forkArticle`. `null` for original articles. Indexed via `articles_forked_from_idx`.

## Organizations & memberships

`organizations` — named groups (slug + name + publisherSlug). Each org is also a publisher. `orgMemberships` — junction linking users to orgs with `role`: `"super_admin"` | `"admin"` | `"member"`. Org creator is auto-assigned `super_admin`.

## Visibility

`resourceVisibility.visibility` is a three-state enum: `"public"` | `"org"` | `"private"`. Absent row means `"public"` (default). `"org"` grants access to all org members without per-user grants.

## Categories

Auto-created on save: `setArticleCategories()` in `app/[publisher]/articles/actions.ts` inserts any missing slugs, then atomically replaces all category links for the article.

## Article views

`articleViews` records page renders. The homepage uses this to show the top 5 articles by view count over the last 30 days. Three columns were added for the analytics dashboard:
- `referrer` — raw `Referer` header value (text, nullable, up to ~2000 chars).
- `referrer_source` — classified source: `"direct"` | `"search"` | `"social"` | `"internal"` | `"external"`. Classified by `lib/analytics-source.ts`. Nullable for legacy rows.
- `session_id` — 32-hex-char anonymous token from the `aview_sid` httpOnly cookie (see `lib/analytics-session.ts`). `null` for rows recorded before the feature was introduced. Indexed together with `articleId` via `article_views_article_session_idx`.

## KAO objects

`objects` table: `id`, `slug`, `name`, `type` (`"animation"` | `"dataset"` | `"diagram"`), `content` (jsonb, schema varies by type), `description`, `ownerType`, `ownerId`, `createdAt`, `updatedAt`.

## Book snapshots

`bookSnapshots` and `bookSnapshotEntries` use `bookId` FK. A snapshot stores each entry's position, part-title, and optionally article content at capture time.

## Access grants

`accessGrants` — one row per explicit grant. `granteeType`: `"user"` | `"org"`. `ownerType`/`ownerId` scope to the resource's publisher. Used only for `"private"` resources.

## Events

`events` table: `id`, `slug` (unique per publisher via `(ownerType, ownerId, slug)` constraint), `title`, `description`, `eventDate`, `category`, `isEraStart`, `isEraEnd`, `eraName`, `ownerType`, `ownerId`, `createdAt`, `updatedAt`. Indexes on `(ownerType, ownerId)`, `eventDate`, `category`.

`eventArticles` junction table: `(eventId → events.id, articleId → articles.id)`. Both cascade-delete. Unique on `(eventId, articleId)`.

See `docs/events.md` for era semantics and the timeline feature.

## Article snapshots

`articleSnapshots` stores immutable publish-time copies of articles. A row is created by `lib/article-snapshots.ts` whenever an article is saved with `status === "published"`. Deduplication uses `onConflictDoNothing` on the `(articleId, contentHash)` unique constraint, so saving the same content twice produces only one snapshot.

| Column | Notes |
|---|---|
| `article_id` | FK → `articles.id`, cascade-delete |
| `content_hash` | Full SHA-256 hex of the content |
| `short_hash` | First 7 chars (denormalised for URL use) |
| `title`, `summary`, `content`, `metadata` | Frozen copy of the article at publish time |
| `published_at` | Defaults to `now()` on insert |

Publicly accessible via `/:publisher/articles/:slug?v=<shortHash>`. The `SnapshotBanner` component is shown when a versioned URL is served. The versions index page lives at `/:publisher/articles/:slug/versions`. See `docs/routing.md` for those routes.

## Notifications

`notifications` is an in-app notification store. `type` is a free-text discriminant (`"stale_article"` | `"article_forked"` | `"article_cited"`) rather than a DB enum, so new notification types require no migration.

| Column | Notes |
|---|---|
| `user_id` | FK → `users.id`, cascade-delete |
| `type` | Discriminant string |
| `payload` | JSONB; shape varies by `type` (see `lib/notifications.ts`) |
| `read_at` | `null` = unread; set by `markNotificationRead` / `markAllNotificationsRead` |
| `created_at` | Defaults to `now()` |

Indexes: `notifications_user_unread_idx` on `(userId, readAt)` for the bell badge query; `notifications_user_created_idx` on `(userId, createdAt)` for the inbox page.

The `notify()` helper inserts unconditionally. `notifyWithDedupe()` skips insertion if an unread notification with the same type and deduplication key already exists for the user (used by the staleness cron to avoid repeat nudges).

## Article citations

`articleCitations` is a join table tracking `<Cite>` references between articles. Rows are recomputed by `lib/citations-sync.ts` on every article save — the diff (added / removed cited IDs) is computed and notifications are sent for newly added citations.

| Column | Notes |
|---|---|
| `citing_article_id` | FK → `articles.id`, cascade-delete |
| `cited_article_id` | FK → `articles.id`, cascade-delete |
| `position` | 0-based order of the `<Cite>` within the citing article |
| `created_at` | Defaults to `now()` |

Unique on `(citingArticleId, citedArticleId)` — multiple `<Cite>` calls to the same target in one article are deduplicated to a single row. Separate indexes on `citing_article_id` and `cited_article_id` support both "what does this article cite?" and "who cites this article?" lookups.

## PDF cache

`pdfCaches` keyed by `bookId`. Stores a SHA-256 content hash and the rendered PDF bytes. Cache hit returns the stored PDF without re-rendering.
