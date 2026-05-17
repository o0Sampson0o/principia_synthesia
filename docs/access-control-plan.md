# Access Control — Resource-Level ACL with Organizations

## Overview

Resources (books and articles) can be made private. Private resources are hidden
from all public listings and return `notFound()` when accessed directly, unless
the requesting user has been explicitly granted access or is a member of the
owning organization.

Three properties shape the design:

1. **Default-public, opt-in private** — existing rows remain viewable. A
   resource is private only if a `resourceVisibility` row exists with
   `visibility = 'private'` or `'org'`.
2. **404 not 403** — denied requests look identical to "not found" so private
   resources do not leak existence. The check is implemented as `notFound()`
   (server pages) or `new NextResponse("Not found", { status: 404 })` (route
   handlers).
3. **Root admins bypass everything** — `session.isRootAdmin === true`
   short-circuits all visibility checks.

---

## Database tables

### `resourceVisibility`

One row per resource with a non-default visibility setting. Absent row means
`'public'`.

| Column | Type | Notes |
|--------|------|-------|
| `resourceType` | text | `'book'` \| `'article'` \| `'object'` |
| `ownerType` | text | `'user'` \| `'org'` |
| `ownerId` | integer | References the publisher's user or org id |
| `resourceKey` | text | The resource slug |
| `visibility` | text | `'public'` \| `'org'` \| `'private'` |

Unique constraint on `(resourceType, ownerType, ownerId, resourceKey)`.

### `accessGrants`

One row per explicit grant of access to a private resource.

| Column | Type | Notes |
|--------|------|-------|
| `resourceType` | text | `'book'` \| `'article'` \| `'object'` |
| `ownerType` | text | Publisher owner type |
| `ownerId` | integer | Publisher owner id |
| `resourceKey` | text | The resource slug |
| `granteeType` | text | `'user'` \| `'org'` |
| `granteeId` | integer | References `users.id` or `organizations.id` |
| `grantedBy` | integer | FK → `users.id` SET NULL |

Unique constraint prevents duplicate grants for the same grantee on the same
resource.

### `organizations`

Named groups of users used as grant grantees.

| Column | Type | Notes |
|--------|------|-------|
| `slug` | text | Unique, kebab-case |
| `name` | text | Display name |
| `creatorId` | integer | FK → `users.id` SET NULL |
| `publisherSlug` | text | Unique, denormalised |

### `orgMemberships`

Junction table linking users to organizations.

| Column | Type | Notes |
|--------|------|-------|
| `orgId` | integer | FK → `organizations.id` CASCADE |
| `userId` | integer | FK → `users.id` CASCADE |
| `role` | text | `'super_admin'` \| `'admin'` \| `'member'` |

Unique on `(orgId, userId)`.

---

## The `lib/access.ts` utility

`lib/access.ts` is a server-only module (`import "server-only"` guard) used by
page/route gates and discovery surfaces.

### `canView(ref: ContentRef, session: SessionPayload | null): Promise<boolean>`

Checks whether a session can view a single resource.

```ts
interface ContentRef {
  type: "article" | "book" | "object";
  ownerType: "user" | "org";
  ownerId: number;
  slug: string;
}
```

Algorithm:
1. Root admin → always `true`.
2. Look up `resourceVisibility`. Absent row = `'public'`.
3. `'public'` → `true`.
4. `'org'` → `true` iff the user is a member of the owning org (`ownerId`).
5. `'private'` → check `accessGrants` for a user grant or an org grant via the
   user's org memberships.

### `filterVisible<T extends ContentRef>(refs: T[], session): Promise<T[]>`

Batch-filters a list of `ContentRef` objects down to those visible to the
session. Uses batched queries (one `resourceVisibility` query per distinct
owner, then one grants query per private subset) rather than N individual
lookups.

Root admins receive the full input list unchanged.

---

## Visibility model

The three-state `visibility` field replaces the old boolean `isPrivate`:

| Value | Who can view |
|-------|-------------|
| `'public'` | Everyone (no login required) |
| `'org'` | Members of the owning organization only |
| `'private'` | Only users or orgs with an explicit `accessGrants` row |

`'org'` is only meaningful for org-owned content (`ownerType = 'org'`). On
user-owned content, `'org'` behaves the same as `'private'`.

---

## Route gates

All public-facing routes that render or export book/article content call
`canView` and return `notFound()` (pages) or a 404 `NextResponse` (API routes)
on failure:

- `/:publisher/articles/[slug]` — checks article visibility
- `/:publisher/books/[bookSlug]` — checks book visibility
- `/:publisher/books/[bookSlug]/[chapter]` — checks book visibility (internal
  articles are additionally verified against `parentBookId`)
- `GET /api/publishers/[publisher]/books/[slug]/export/pdf`
- `GET /api/publishers/[publisher]/books/[slug]/export/epub`
- `GET /api/publishers/[publisher]/books/[slug]/export/bundle`

---

## Discovery filtering

All public listing surfaces use `filterVisible` to strip inaccessible content
before rendering:

- **Homepage** — book list and recently-updated articles
- **Search page** — article results
- **Category pages** — article results
- **Sitemap** — called with `session = null` so only public resources appear
- **Command palette** (`searchAll()`) — articles and books are filtered for
  non-root-admin sessions

---

## Admin UI

Access management lives under the publisher namespace at
`/:publisher/books/[bookSlug]/access` and `/:publisher/articles/[slug]/access`.

- **Visibility toggle** — sets `resourceVisibility.visibility` to `'public'`,
  `'org'`, or `'private'` via the `setResourceVisibility` server action.
- **Grant management** — add or remove `accessGrants` rows via `addAccessGrant`
  and `removeAccessGrant`.
- **Organization management** — `/:publisher/members` for managing org
  membership.

All access-related server actions require `session.isRootAdmin` or appropriate
publisher ownership and throw `"Unauthorized"` otherwise (defense-in-depth,
since publisher pages also enforce auth at the route level).

---

## Non-admin user accounts

Non-root-admin users are created via signup (`/signup`) or by a root admin.
They log in at `/login` and receive a JWT session cookie with
`isRootAdmin: false`. They cannot access root-admin-gated routes but can be
granted access to private content via `accessGrants`.

---

## Design decisions

### Why `granteeType` + `granteeId` instead of two FK columns

A single grant row covers both user and org grants with one schema. The unique
index naturally prevents duplicates. Drizzle has no native discriminated FK so
`granteeId` is not FK-enforced; orphaned grants (from a deleted user or org)
are cleaned up by the action that performs the deletion.

### Why three-state visibility instead of a boolean

`'org'` visibility allows org-owned content to be restricted to org members
without requiring individual `accessGrants` rows for every member. This covers
the common case of an organization's internal content without administrative
overhead.

### 404 over redirect for denied requests

Unauthenticated users trying to read a private resource get a 404, not a
redirect to `/login`. A redirect would leak that the resource exists. This
applies to both logged-out users and logged-in users without a grant.
