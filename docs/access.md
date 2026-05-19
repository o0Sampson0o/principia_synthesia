# Access Control

Resources (books, articles, objects) can have their visibility restricted. Private resources are hidden from public listings and return `notFound()` when accessed directly, unless the requesting user has been granted access.

## Database tables

- `resourceVisibility` — one row per resource with non-public visibility. Fields: `resourceType` (`"book"` | `"article"` | `"object"` | `"event"`), `ownerType` + `ownerId` (publisher scope), `resourceKey` (slug), `visibility` (`"public"` | `"org"` | `"private"`). Absent row = `"public"` (default). `"org"` grants access to all org members without explicit per-user grants.
- `accessGrants` — one row per explicit grant. `granteeType`: `"user"` | `"org"`. Used only for `"private"` resources.
- `organizations` — named groups (slug + name + publisherSlug). Each org is also a publisher.
- `orgMemberships` — junction with `role`: `"super_admin"` | `"admin"` | `"member"`.

## `lib/access.ts`

- `canView(ref, session)` — returns `true` if the session can view a `ContentRef` (`{type, ownerType, ownerId, slug}`). `type` is `"book"` | `"article"` | `"object"` | `"event"`. Algorithm: root admin → always true; absent visibility row → public → true; `"org"` → user must be a member of the owning org; `"private"` → check `accessGrants` for user or org grant.
- `filterVisible(refs, session)` — batch filter for `ContentRef[]`. Returns the subset visible to `session`. Used by publisher profile pages, article listing, and search.

Root admin sessions (`session.isRootAdmin`) bypass all visibility checks.

## Route gates

- All public listing pages (homepage, category, search) filter out non-public content via `filterVisible()` or direct `resourceVisibility` join conditions.
- Route-level pages call `canView()` and return `notFound()` on failure.
- Export routes (PDF, EPUB, bundle) call `canView()` before checking the feature flag.

## UI

- `/:publisher/books/[bookSlug]/access` — per-book visibility (three-state toggle) + grant management.
- `/:publisher/articles/[slug]/access` — per-article visibility + grants.
- `/organizations` — public list of orgs; create a new one.
- `/:publisher/members` — org member management (view, add/remove, update roles, leave). Only valid for org publishers; requires at least `"member"` role.

**`VisibilityToggle`** (`"use client"`) renders a three-state selector: green (public) / amber (org) / red (private). Clicking calls the visibility action via `useTransition`, updating local state optimistically.

The grants table shows `accessGrants.grantedAt` (formatted "Mon DD, YYYY"). Add-grant menus pre-filter already-granted entities.

## Server actions

- `setBookVisibility` / `setArticleVisibility` / `setEventVisibility` — upsert `resourceVisibility` rows.
- `addBookGrant` / `addArticleGrant` / `addEventGrant` — insert `accessGrants`.
- `removeBookGrant` / `removeArticleGrant` / `removeEventGrant` — delete `accessGrants`.
- `createOrganization`, `deleteOrganization`, `addOrgMember`, `removeOrgMember`, `leaveOrg`, `updateOrgMemberRole` — in `app/organizations/actions.ts`.

All actions verify edit rights with `canEditContent()` from `lib/roles.ts`.
