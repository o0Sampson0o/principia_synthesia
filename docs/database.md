# Database

PostgreSQL via Drizzle ORM. `db/index.ts` exports the `db` client. Schema in `db/schema.ts`.

## Tables

`publishers`, `users`, `organizations`, `orgMemberships`, `books`, `articles`, `revisions`, `categories`, `articleCategories`, `curriculumEntries`, `userThemes`, `bookSnapshots`, `bookSnapshotEntries`, `pdfCaches`, `resourceVisibility`, `accessGrants`, `objects`, `articleViews`, `events`, `eventArticles`

## Publisher model

All content (articles, books, objects) is owned by a publisher — either a user or an org — identified by `ownerType` (`"user"` | `"org"`) and `ownerId` (FK to `users.id` or `organizations.id`). The `publishers` table enforces globally unique slugs across users and orgs. Each user and org has a `publisherSlug` denormalised field.

## Books

`books` is an explicit table (slug, title, ownerType, ownerId). Slugs are unique per publisher. `curriculumEntries` references `books.id` via a `bookId` FK. `bookSnapshots` and `pdfCaches` also use `bookId`. Deleting a book cascades to entries, snapshots, and PDF cache. Internal articles owned by a book are cascade-deleted via `parentBookId` FK.

## Articles

`articles.parentBookId` (FK → `books.id`) identifies which book owns an internal article (replaces the old `parentBookSlug` text column). `articles.isInternal` marks internal articles. `articles.metadata` (JSONB) stores parsed frontmatter so it's queryable without re-parsing.

## Organizations & memberships

`organizations` — named groups (slug + name + publisherSlug). Each org is also a publisher. `orgMemberships` — junction linking users to orgs with `role`: `"super_admin"` | `"admin"` | `"member"`. Org creator is auto-assigned `super_admin`.

## Visibility

`resourceVisibility.visibility` is a three-state enum: `"public"` | `"org"` | `"private"`. Absent row means `"public"` (default). `"org"` grants access to all org members without per-user grants.

## Categories

Auto-created on save: `setArticleCategories()` in `app/[publisher]/articles/actions.ts` inserts any missing slugs, then atomically replaces all category links for the article.

## Article views

`articleViews` records page renders (articleId + viewedAt, no PII). The homepage uses this to show the top 5 articles by view count over the last 30 days.

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

## PDF cache

`pdfCaches` keyed by `bookId`. Stores a SHA-256 content hash and the rendered PDF bytes. Cache hit returns the stored PDF without re-rendering.
