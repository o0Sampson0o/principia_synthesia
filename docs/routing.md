# Routing, Authentication & Roles

## Public routes

`/`, `/category`, `/category/:slug`, `/search`, `/organizations`, `/pricing`, `/login`, `/signup`, `/timeline`

## Publisher routes (`/:publisher/`)

All content management is publisher-scoped. There is no `/admin/**` route structure — access is gated by `canEditContent()` from `lib/roles.ts` on every action and page.

| Route | Purpose |
|---|---|
| `/:publisher/` | Publisher profile / hub |
| `/:publisher/articles` | List articles |
| `/:publisher/articles/new` | Create article |
| `/:publisher/articles/[slug]` | Read article |
| `/:publisher/articles/[slug]/edit` | Edit article |
| `/:publisher/articles/[slug]/access` | Per-article visibility & grants |
| `/:publisher/books/new` | Create book |
| `/:publisher/books/[bookSlug]` | Book TOC |
| `/:publisher/books/[bookSlug]/[chapter]` | Read chapter |
| `/:publisher/books/[bookSlug]/edit` | Edit book (entries, reorder, snapshots, sync) |
| `/:publisher/books/[bookSlug]/access` | Per-book visibility & grants |
| `/:publisher/objects` | List KAO objects |
| `/:publisher/objects/new` | Create object |
| `/:publisher/objects/[objSlug]` | Edit/delete/preview object |
| `/:publisher/images` | Image manager |
| `/:publisher/members` | Org member management (org publishers only) |
| `/:publisher/events` | List publisher events |
| `/:publisher/events/new` | Create event |
| `/:publisher/events/[eventSlug]` | Event detail |
| `/:publisher/events/[eventSlug]/edit` | Edit event |
| `/:publisher/events/[eventSlug]/access` | Per-event visibility & grants |

Root-admin-only logic is enforced inside server actions and pages via `requireRootAdmin()`.

## Middleware (`middleware.ts`)

The middleware does **not** gate publisher routes. It only:
1. Rate-limits `/login` and `/signup`.
2. Redirects unauthenticated requests to `/settings/**` → `/login`.
3. Attaches a per-request CSP nonce to every response via `x-csp-nonce` header.

See `docs/ui.md` for CSP details.

## Authentication (`lib/auth.ts`)

Helpers: bcrypt password hashing, JWT creation/verification (jose, HS256, 7-day expiry), `session` httpOnly cookie read/write.

- `getSession()` — called in Server Components to get the current user.
- `requireSession()` — redirects to `/login` if unauthenticated.
- `requireRootAdmin()` — redirects to `/` if not root admin.

`SessionPayload` carries: `userId`, `email`, `userSlug`, `isRootAdmin`. Stale cookies with the old `isAdmin` shape are rejected and return `null`.

## User accounts

Users self-register at `/signup` (creates a user + publisher row atomically). `isRootAdmin` is `false` for all self-registered users; root admins are set directly in the database.

## Publisher roles (`lib/roles.ts`)

- `getOrgRole(userId, orgId)` — returns `"super_admin"` | `"admin"` | `"member"` | `null`.
- `canManageOrg(session, orgId)` — true for root admin, super_admin, or admin of the org.
- `canEditContent(session, ownerType, ownerId)` — true if the session can create/edit/delete content for that publisher. User-owned: same user or root admin. Org-owned: super_admin or admin of that org, or root admin.
- `isSuperAdminProtected(targetUserId, orgCreatorId, rootAdminId)` — true if the user is protected from demotion or removal (org creator or root admin).

**Org membership roles:** `"super_admin"` | `"admin"` | `"member"` (three levels). Org creator is automatically `super_admin`.
