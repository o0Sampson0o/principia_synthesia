# Principia Synthesia — Ground-Up Redesign Implementation Plan

> **Status:** Plan. Not yet executed.
> **Target:** Next.js 16 / React 19 / Drizzle ORM / PostgreSQL — the existing repository at `/home/lagrange/dev/principia-synthesia/`.
> **Scope:** Multi-publisher (user + org) identity model, path-based publisher URLs, three-tier visibility, replacement of the binary admin/non-admin model with org-relative roles, removal of the on-disk plugin system. Many infra-level subsystems (theme, MDX pipeline, KAO content types, exports, PWA, CSP, rate limiter, Sentry) remain intact and are only minimally adjusted at the edges.
> **Clean-slate approach:** There is no real production data. The database is wiped and rebuilt from scratch. No data migration, no backward compatibility, no legacy slug handling. The new schema is the only schema.

---

## 1. Overview

The current codebase models content as globally-slugged rows owned by no one; access is gated by a binary `isAdmin` flag plus an opt-in private/public switch with grants. The redesign turns the platform into a **multi-publisher system**:

- Every actor that can own content is a **publisher** — either a `user` or an `organization`. Publishers have a permanent, globally-unique slug.
- All content (articles, books, KAO objects) has an `ownerType` + `ownerId`, and slugs are unique only within a single publisher.
- The URL scheme becomes `/<publisher>/<contentType>/<slug>` — there is no more homepage article with a bare slug.
- Visibility is a three-state enum per content item: `public`, `org` (visible to all members of the owning org), or `private` (explicit grants).
- The binary admin gate becomes one root admin flag plus three org-relative roles (`super_admin`, `admin`, `member`). The `/admin/**` tree is deleted.
- Self-service signup is introduced. Every new user picks their publisher slug at signup, immutable thereafter.
- The on-disk plugin system is removed entirely.

The work is structured into eight phases, each of which leaves the codebase in a coherent state. Phases 1–3 are foundation and must be completed in order. Phases 4–7 can be partially parallelised. Phase 8 is cleanup.

---

## 2. Assumptions

1. **Publisher slug regex:** `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Minimum length 3, maximum 40 characters. Immutable post-creation.
2. **Cross-table uniqueness:** A unified `publishers` table enforces slug uniqueness at the DB level across both users and orgs.
3. **`ownerType + ownerId` storage:** Content tables store `ownerType: "user" | "org"` and `ownerId: integer` pointing at `users.id` or `organizations.id` directly. `publishers` is for slug lookup only.
4. **Root admin auto-membership:** `createOrganization()` inserts the root admin into `orgMemberships` as `super_admin` within the same transaction. No DB trigger.
5. **Single root admin:** One user has `isRootAdmin = true`, publisher slug `principia-official`. Set via the seed.
6. **Slug prefix enforcement:** All content slugs carry a mandatory type prefix: `article-`, `book-`, `anim-`, `object-`. Enforced via Zod refinement at the application layer on every create. No exceptions — the seed also uses correctly prefixed slugs.
7. **Export API URLs:** `/api/publishers/<publisher>/books/<bookslug>/export/{pdf|epub|bundle|sync}`.
8. **No old URL redirects:** Old routes are deleted. Clean break.
9. **`isInternal` articles:** Retained. Internal articles have the same `ownerType`/`ownerId` as the parent book. `/[publisher]/articles/[slug]` returns `notFound()` when `isInternal = true`.
10. **Sessions:** JWT payload changes. All existing cookies become invalid on deploy — users re-login. A defensive check in `getSession()` clears cookies with the old shape.
11. **Categories:** Remain global taxonomy, not per-publisher. Updated to produce owner-scoped URLs in search results.
12. **`savedAnimations` table:** Dropped. Already dead.

---

## 3. Architecture & Design Decisions

### 3.1 Publisher model

```
publishers
  id          serial PK
  slug        text UNIQUE NOT NULL
  kind        text NOT NULL  CHECK (kind IN ('user', 'org'))
  userId      integer REFERENCES users(id) ON DELETE CASCADE  NULLABLE
  orgId       integer REFERENCES organizations(id) ON DELETE CASCADE  NULLABLE
  createdAt   timestamp DEFAULT now()
  CHECK ((userId IS NOT NULL) != (orgId IS NOT NULL))   -- exactly one
```

- `users` gets a `publisherSlug` column (text, not FK — avoids circular dependency; the slug is the stable identifier).
- `organizations` gets a `publisherSlug` column for the same reason.
- The cascade goes: deleting a user/org cascade-deletes the `publishers` row.

### 3.2 Content ownership

Every content table gets:
```
ownerType  text NOT NULL  CHECK (ownerType IN ('user', 'org'))
ownerId    integer NOT NULL
```
Plus a composite unique constraint `(ownerType, ownerId, slug)` replacing the old global `UNIQUE (slug)`.
An index on `(ownerType, ownerId)` covers all publisher-scoped list queries.

### 3.3 Books table

```ts
export const books = pgTable("books", {
  id:        serial("id").primaryKey(),
  slug:      text("slug").notNull(),
  title:     text("title").notNull(),
  ownerType: text("owner_type").notNull(),
  ownerId:   integer("owner_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [unique().on(t.ownerType, t.ownerId, t.slug)]);
```

`curriculumEntries` drops `bookSlug` + `bookTitle` and gains `bookId FK → books.id CASCADE`.
`bookSnapshots`, `pdfCaches` likewise gain `bookId` FK.
`articles.parentBookSlug` becomes `parentBookId FK → books.id CASCADE`.

### 3.4 Visibility model

`resourceVisibility.isPrivate: boolean` → `visibility: text NOT NULL DEFAULT 'public'`
Values: `'public' | 'org' | 'private'`.

`resourceVisibility` also gains `ownerType` + `ownerId` so the row is scoped to a publisher.
`accessGrants` gains the same two columns.

`'org'` visibility is gated purely by `orgMemberships` — no grant rows needed.
`'private'` uses `accessGrants` as today.
`'org'` is rejected (validation error) when the content owner is a user (not an org).

### 3.5 Roles

`users.isAdmin` → `users.isRootAdmin`.
`orgMemberships.role` → `'super_admin' | 'admin' | 'member'` (was `'owner' | 'member'`).
Root admin is auto-`super_admin` of every org at org-creation time.
`super_admin` rows (org creator + root admin) are protected in `lib/roles.ts` — no action can demote or remove them.

### 3.6 Homepage

The homepage is a **hero landing page** explaining what Principia Synthesia is, followed by a "Top articles this month" section showing the 5 most-visited public articles over the last 30 days.

**View tracking:** A new `articleViews` table stores one row per page render (`articleId FK → articles.id CASCADE`, `viewedAt timestamp DEFAULT now()`). No PII. Views are recorded server-side inside the article page server component. The top-5 query aggregates `COUNT(*) WHERE viewedAt > NOW() - INTERVAL '30 days'` joined against public articles only. No caching needed at launch — the query is cheap.

**`articleViews` schema:**
```ts
export const articleViews = pgTable("article_views", {
  id:        serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  viewedAt:  timestamp("viewed_at").defaultNow().notNull(),
});
// Index on (articleId, viewedAt) for the monthly aggregation query.
```

The hero section content (headline, tagline, feature bullets) is static JSX — no CMS involvement.

### 3.7 Publisher profile page (`/<publisher>`)

Visible to anyone (including logged-out visitors).

**Structure:**
- Header: display name, publisher slug (`@slug`), optional bio/description (future field — not in this iteration, just name + slug).
- Tabs or sections: **Books**, **Articles**, **Objects** — each shows the publisher's content in that category.
- Strangers see only `public` content.
- The owner (user viewing their own profile) or an org admin viewing the org profile sees all content with visibility badges (`public` / `org` / `private`).
- For orgs: show member count below the org name.

This is the GitHub profile model.

### 3.8 Publisher selection when creating content

**URL-based.** The publisher is determined by which URL you navigate to:
- `/sampson/articles/new` → creates an article owned by user `sampson`.
- `/faculty/articles/new` → creates an article owned by org `faculty`.

The server action reads the publisher slug from the URL params, resolves the publisher, verifies the session has edit rights (`canEditContent`), and stamps `ownerType`/`ownerId` on the new content row.

**Nav "New article" button** → links to `/<session.userSlug>/articles/new` (always your own publisher). To publish as an org, navigate to the org's profile page (`/<orgSlug>`) first — that page has its own "New article / New book / New object" buttons in context.

No dropdowns, no modal, no confusion about identity.

### 3.9 URLs

```
/                                        hero landing page + top 5 articles
/signup                                  self-service signup
/login
/organizations                           list of orgs current user belongs to
/organizations/new

/<publisher>                             publisher profile + dashboard
/<publisher>/articles                    article list
/<publisher>/articles/new                create (gated)
/<publisher>/articles/<slug>             article detail
/<publisher>/articles/<slug>/edit        edit (gated)
/<publisher>/articles/<slug>/revisions   revision history (gated)
/<publisher>/books                       book list
/<publisher>/books/new                   create book (gated)
/<publisher>/books/<slug>                book TOC
/<publisher>/books/<slug>/<chapter>      chapter
/<publisher>/books/<slug>/edit           curriculum editor (gated)
/<publisher>/books/<slug>/access         visibility + grants (gated)
/<publisher>/books/<slug>/snapshots      snapshots (gated)
/<publisher>/books/<slug>/sync           sync UI (gated)
/<publisher>/objects                     objects list
/<publisher>/objects/new                 create object (gated)
/<publisher>/objects/<slug>              object detail
/<publisher>/objects/<slug>/edit         edit object (gated)

/search    /category    /category/<slug>    /pricing    /settings/...

/api/publishers/<publisher>/books/<slug>/export/pdf
/api/publishers/<publisher>/books/<slug>/export/epub
/api/publishers/<publisher>/books/<slug>/export/bundle
/api/publishers/<publisher>/books/<slug>/export/sync
/api/publishers/<publisher>/animations/<slug>
/api/themes/<slug>                           (unchanged)
/api/auth/logout                             (unchanged)
```

### 3.7 Wikilink syntax

Single unified format: `[[publisher:type:slug]]`
Types: `articles`, `books`, `objects`.
Label variant: `[[publisher:type:slug|Display text]]`.
All old syntaxes (`[[slug]]`, `[[book:slug]]`, `[[anim:slug]]`, `[[object:slug]]`) are removed. Unmatched wikilinks render as literal text.

### 3.8 Phase boundary discipline

Each phase ends with `npm run build` and `npm run test:run` both passing (or explicitly noted as "app won't build yet" for Phase 1 which is schema-only).

---

## 4. Phase 1 — Schema (LOAD-BEARING)

**This phase must complete before any code outside `db/` is rewritten.**

### 4.1 Wipe and rebuild

Since there is no real data, the cleanest approach is:

```bash
# Drop the database entirely and recreate it
psql postgres -c "DROP DATABASE principia_synthesia;"
psql postgres -c "CREATE DATABASE principia_synthesia;"

# Delete all existing Drizzle migration files so we start clean
rm -rf drizzle/

# After rewriting db/schema.ts (step 4.2), generate a single fresh migration
npx drizzle-kit generate
npx drizzle-kit migrate
```

This produces one clean migration with no legacy cruft.

### 4.2 Rewrite `db/schema.ts` from scratch

New complete schema — write the whole file fresh, do not patch the old one. Tables in dependency order:

1. **`publishers`** — slug UNIQUE, kind, userId nullable FK, orgId nullable FK, CHECK exactly one non-null.
2. **`users`** — id, email UNIQUE, passwordHash, isRootAdmin bool (default false), displayName text, publisherSlug text UNIQUE (denormalised for fast session lookup).
3. **`organizations`** — id, slug UNIQUE, name, creatorId FK→users, publisherSlug text UNIQUE, createdAt.
4. **`orgMemberships`** — orgId FK, userId FK, role `'super_admin'|'admin'|'member'`, joinedAt. UNIQUE(orgId, userId).
5. **`books`** — id, slug, title, ownerType, ownerId, createdAt, updatedAt. UNIQUE(ownerType, ownerId, slug).
6. **`articles`** — id, slug, title, content, summary, ownerType, ownerId, isInternal bool, parentBookId FK→books nullable, metadata jsonb, createdAt, updatedAt. UNIQUE(ownerType, ownerId, slug).
7. **`categories`** — unchanged.
8. **`articleCategories`** — unchanged.
9. **`revisions`** — unchanged (FK→articles cascade).
10. **`curriculumEntries`** — id, bookId FK→books CASCADE, articleId FK→articles CASCADE, position, partTitle. UNIQUE(bookId, articleId).
11. **`objects`** — id, slug, name, type, content jsonb, description, ownerType, ownerId, createdAt, updatedAt. UNIQUE(ownerType, ownerId, slug). *(Drop `source`, `pluginMeta` — plugin system gone.)*
12. **`userThemes`** — unchanged (FK→users).
13. **`bookSnapshots`** — id, bookId FK→books CASCADE, note, createdAt.
14. **`bookSnapshotEntries`** — id, snapshotId FK→bookSnapshots CASCADE, articleId FK→articles CASCADE, articleSlug, articleTitle, articleContent, position, partTitle.
15. **`pdfCaches`** — id, bookId FK→books CASCADE, pdfData, contentHash, generatedAt.
16. **`resourceVisibility`** — id, resourceType, ownerType, ownerId, resourceKey (slug), visibility `'public'|'org'|'private'` default `'public'`, updatedAt. UNIQUE(resourceType, ownerType, ownerId, resourceKey).
17. **`accessGrants`** — id, resourceType, ownerType, ownerId, resourceKey, granteeType, granteeId, grantedAt, grantedBy FK→users set null. UNIQUE(resourceType, ownerType, ownerId, resourceKey, granteeType, granteeId).

**Drop entirely:** `savedAnimations`.

### 4.3 Verify

```bash
npx drizzle-kit studio
# Confirm all tables exist with correct columns and constraints.
```

The app will not build after this phase (code still references old column names). That is expected.

---

## 5. Phase 2 — Auth, Session, Middleware, Signup

### 5.1 `lib/auth.ts`

New `SessionPayload`:
```ts
export interface SessionPayload extends JWTPayload {
  userId: number;
  email: string;
  userSlug: string;      // publisher slug
  isRootAdmin: boolean;
}
```

Add helpers:
- `requireSession()` — reads session, redirects to `/login` if absent.
- `requireRootAdmin()` — reads session, redirects to `/` if not root admin.
- `getSessionWithPublisher()` — returns session + displayName in one call (for layouts).

Defensive check in `getSession()`: if decoded payload lacks `userSlug` or `isRootAdmin`, clear the cookie and return null. This handles stale cookies from before the redesign.

### 5.2 `middleware.ts`

Remove the `/admin/**` guard entirely.

Keep:
- CSP nonce generation on every request.
- Rate limiting on `/login` and `/signup`.
- Redirect `/settings/**` to `/login` when no session (thin gate — faster than per-route checks).

Update `allowEval` heuristic to cover: `/settings/**`, `/<publisher>/articles/new`, `/<publisher>/articles/*/edit`, `/<publisher>/objects/new`, `/<publisher>/objects/*/edit`. Use a regex test against `pathname`.

### 5.3 Login action (`app/login/actions.ts`)

Join `users` with `publishers` (or read `users.publisherSlug` directly — preferred, since it's denormalised):
```ts
const [row] = await db.select({
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  isRootAdmin: users.isRootAdmin,
  userSlug: users.publisherSlug,
}).from(users).where(eq(users.email, validated.email)).limit(1);
```
On success: `setSessionCookie({ userId, email, userSlug, isRootAdmin })`, redirect to `/<userSlug>`.

### 5.4 Signup (`app/signup/page.tsx` + `app/signup/actions.ts`)

**Form fields:** email, password, password-confirm, display name, publisher slug.

**Slug input UX:** A static `/` prefix label before the input field. Below the field, live URL preview: `principia-synthesia.com/<typed-slug>`. Validation: format + uniqueness check against `publishers.slug`.

**`signupSchema`** (add to `lib/validations.ts`):
```ts
const RESERVED_SLUGS = ["login","signup","search","organizations","settings","category","pricing","api"];

export const publisherSlugSchema = z
  .string().min(3).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((s) => !RESERVED_SLUGS.includes(s), "That slug is reserved");

export const signupSchema = z.object({
  email:         z.string().email(),
  password:      z.string().min(8),
  displayName:   z.string().min(1).max(100),
  publisherSlug: publisherSlugSchema,
});
```

**`signupAction`** — wrapped in `db.transaction`:
1. Validate input.
2. Check email uniqueness on `users`.
3. Check slug uniqueness on `publishers`.
4. Insert `users` row (`isRootAdmin: false`).
5. Insert `publishers` row (`kind: 'user'`, `userId: newUser.id`).
6. Update `users.publisherSlug = slug`.
7. `setSessionCookie({ userId, email, userSlug, isRootAdmin: false })`.
8. `redirect('/<publisherSlug>')`.

### 5.5 Tests

- Update `tests/lib/auth.test.ts` — new payload shape, defensive stale-cookie check.
- Update `tests/middleware.test.ts` — remove admin gate cases, add signup rate-limit case.
- Add `tests/actions/signup-actions.test.ts` — valid signup, email collision, slug collision against org, slug collision against user, weak password, transaction rollback on partial failure.

---

## 6. Phase 3 — Validations + Helpers

### 6.1 `lib/validations.ts`

Add slug schemas:
```ts
export const publisherSlugSchema = z.string().min(3).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const articleSlugSchema   = z.string().regex(/^article-[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const bookSlugSchema      = z.string().regex(/^book-[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const animSlugSchema      = z.string().regex(/^anim-[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const objectSlugSchema    = z.string().regex(/^object-[a-z0-9]+(?:-[a-z0-9]+)*$/);
```

Update existing schemas:
- `createArticleSchema` / `updateArticleSchema`: `slug` → `articleSlugSchema`.
- `upsertCurriculumEntrySchema`: replace `bookSlug`+`bookTitle` with `bookId: z.coerce.number().int().positive()`.
- `createInternalArticleSchema`: same replacement; slug → `articleSlugSchema`.
- `setVisibilitySchema`: replace `isPrivate: z.coerce.boolean()` with `visibility: z.enum(["public","org","private"])`.
- `addOrgMemberSchema`: role → `z.enum(["super_admin","admin","member"])`.
- `createKaoSchema` / `updateKaoSchema`: `slug` uses a `superRefine` that picks `animSlugSchema` when `type === "animation"` and `objectSlugSchema` otherwise.
- Add `createBookSchema` (slug: bookSlugSchema, title, ownerType, ownerId).
- Add `deleteBookSchema` (bookId).
- Remove `pluginManifestSchema`, `PluginManifest`, `syncBundleChapterSchema`… wait — sync bundle is kept; only the plugin manifest schemas are removed.

### 6.2 `lib/publisher.ts` (new)

```ts
export interface ResolvedPublisher {
  kind: "user" | "org";
  userId: number | null;
  orgId: number | null;
  slug: string;
  displayName: string;   // user displayName or org name
}

export async function resolvePublisher(slug: string): Promise<ResolvedPublisher | null>;
```

Single join query. Every page under `/[publisher]/**` calls this first; returns `notFound()` on null.

### 6.3 `lib/roles.ts` (new)

```ts
export type OrgRole = "super_admin" | "admin" | "member";

export async function getOrgRole(userId: number, orgId: number): Promise<OrgRole | null>;

export async function canManageOrg(session: SessionPayload | null, orgId: number): Promise<boolean>;
// true if isRootAdmin, or membership.role in ('super_admin', 'admin')

export async function canEditContent(
  session: SessionPayload | null,
  ownerType: "user" | "org",
  ownerId: number
): Promise<boolean>;
// user-owned: only same user (or root admin)
// org-owned: super_admin or admin of that org (or root admin)

export function isSuperAdminProtected(
  targetUserId: number,
  orgCreatorId: number,
  rootAdminId: number
): boolean;
// true if the target user is the org creator or the root admin — block demote/remove
```

---

## 7. Phase 4 — Access Control Rewrite

### 7.1 Rewrite `lib/access.ts`

New API:
```ts
type ContentType = "article" | "book" | "object";

interface ContentRef {
  type: ContentType;
  ownerType: "user" | "org";
  ownerId: number;
  slug: string;
}

export async function canView(ref: ContentRef, session: SessionPayload | null): Promise<boolean>;

export async function filterVisible<T extends ContentRef>(
  refs: T[],
  session: SessionPayload | null
): Promise<T[]>;
```

`canView` algorithm:
1. `session?.isRootAdmin` → `true`.
2. Look up `resourceVisibility` for `(type, ownerType, ownerId, slug)`. Absent = `'public'`.
3. `'public'` → `true`.
4. `'org'` → owner must be an org; return `true` iff `session.userId` has any membership in org `ownerId`.
5. `'private'` → check `accessGrants` for user grant (granteeId = session.userId) OR org grant (granteeId IN session's org memberships).

`filterVisible` batches: one `resourceVisibility` query for the set, then one `accessGrants` query for the private subset, then membership check for org-visible ones.

### 7.2 Tests

Rewrite `tests/lib/access.test.ts`. Add `tests/lib/roles.test.ts` and `tests/lib/publisher.test.ts`.

Key cases for `canView`:
- Public content, logged out → true.
- Org content, member → true; non-member → false; root admin → true.
- Private content, granted user → true; non-granted → false.
- Private content, granted org → true for members of that org.
- `org` visibility on user-owned content → false (invalid state, defensive).

---

## 8. Phase 5 — Route Restructure & Server Actions

### 8.1 Routes to DELETE

```
app/[slug]/                      (bare article URL)
app/curriculum/                  (entire tree)
app/objects/                     (entire tree)
app/admin/                       (entire tree, 15+ pages)
app/api/curriculum/              (old export routes)
app/api/objects/                 (preview redirect)
app/api/animations/              (replaced by publisher-scoped route)
```

### 8.2 Routes to CREATE

See §3.6 for the full URL table. All new page files live under `app/[publisher]/...`.

Every page under `/[publisher]/**` begins:
```ts
const { publisher } = await params;
const pub = await resolvePublisher(publisher);
if (!pub) notFound();
```

Gated pages additionally call `canEditContent` or `canManageOrg` and redirect to the profile page on failure.

### 8.3 Server actions reorganisation

Split the old monolithic `app/admin/actions.ts` into domain-scoped files:

| New file | Contains |
|---|---|
| `app/[publisher]/articles/actions.ts` | createArticle, updateArticle, deleteArticle, restoreRevision, updateArticleContent, setArticleCategories |
| `app/[publisher]/books/actions.ts` | createBook, updateBook, deleteBook, upsertCurriculumEntry, removeCurriculumEntry, reorderCurriculumEntries, createInternalArticle, snapshotBook, restoreBookSnapshot, listBookSnapshots |
| `app/[publisher]/books/[slug]/access/actions.ts` | setResourceVisibility, addAccessGrant, removeAccessGrant |
| `app/[publisher]/books/[slug]/sync/actions.ts` | importSyncBundle (moved from old admin path) |
| `app/[publisher]/objects/actions.ts` | createKaoObject, updateKaoObject, deleteKaoObject |
| `app/organizations/actions.ts` | createOrganization, deleteOrganization, addOrgMember, removeOrgMember, promoteMember, demoteMember |
| `app/signup/actions.ts` | signupAction |
| `lib/search.ts` | searchAll (extracted, no longer a server action — called from CommandPalette) |

**Deleted:** `app/admin/actions.ts`, `app/admin/access/actions.ts`, `app/admin/objects/actions.ts`, `app/admin/objects/plugins/actions.ts`.

### 8.4 Auth pattern in every action

```ts
export async function createArticle(publisherSlug: string, formData: FormData) {
  const session = await requireSession();               // throws redirect if not logged in
  const pub = await resolvePublisher(publisherSlug);
  if (!pub) throw new Error("Publisher not found");
  if (!(await canEditContent(session, pub.kind === "user" ? "user" : "org", pub.userId ?? pub.orgId!)))
    throw new Error("Forbidden");
  // ... validate, insert, revalidatePath, redirect
}
```

### 8.5 Internal articles

- `createInternalArticle` accepts `bookId` (not bookSlug).
- Article gets same `ownerType`/`ownerId` as the book (enforced in action).
- Article gets `parentBookId = bookId`.
- `/[publisher]/articles/[slug]` → `notFound()` if `isInternal`.
- `/[publisher]/books/[slug]/[chapter]` verifies `parentBookId` matches, OR article is non-internal with a curriculum entry in the book.

### 8.6 Component updates

- **`components/Nav.tsx`** — drop Admin/Curriculum/New article links; add Organizations link; add `/<userSlug>` profile link (user's display name); keep Sign in/Sign out/Theme.
- **`components/DynamicAnimation.tsx`** — add `publisher: string` prop; pass it to the new animation API URL `/api/publishers/<publisher>/animations/<slug>`. No legacy fallback — all animation embeds in new MDX use the full publisher prefix.
- **`components/CommandPalette.tsx`** — update result shape from `searchAll`; build hrefs from `/<publisher>/<type>/<slug>`.
- **`lib/useAnimationSrc.ts`** — `buildAnimationSrc(publisher, slug, version?)`.

### 8.7 Export + animation API routes

Move to publisher-scoped paths (§3.6). The internal logic of PDF/EPUB/bundle/sync generation is unchanged — only the route file location and how `bookId` is resolved (via publisher + book slug lookup rather than a bare book slug).

### 8.8 Tests

- Delete `tests/actions/admin-actions.test.ts`, `tests/actions/access-actions.test.ts`, `tests/actions/plugin-actions.test.ts`.
- Add `tests/actions/articles-actions.test.ts`, `tests/actions/books-actions.test.ts`, `tests/actions/objects-actions.test.ts`, `tests/actions/org-actions.test.ts`, `tests/actions/access-grants-actions.test.ts`.
- Update all API route tests to new URL paths (`/api/publishers/principia-official/books/...`).
- Update `tests/lib/useAnimationSrc.test.ts` for the new `publisher` parameter.
- Update `tests/lib/book-toc.test.ts` for `bookId`-based queries.
- Mechanical find/replace across all test files: `isAdmin: true` → `isRootAdmin: true`, add `userSlug: "test-admin"` to every mocked session payload.

---

## 9. Phase 6 — Wikilinks Rewrite

### 9.1 `lib/remark-wikilinks.ts`

Full rewrite. New regex: `/\[\[([a-z0-9-]+):(articles|books|objects):([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g`

```ts
const [, publisher, type, slug, label] = match;
const href = `/${publisher}/${type}/${slug}`;
const display = label ?? slug;
// Emit a hast `link` node.
```

Anything that does not match the new regex is left as literal text.

### 9.2 Tests

Rewrite `tests/lib/remark-wikilinks.test.ts`:

- `[[sampson:articles:article-newton-laws]]` → `/sampson/articles/article-newton-laws`.
- `[[sampson:articles:article-newton-laws|Newton's Laws]]` → same URL, display "Newton's Laws".
- `[[faculty:books:book-classical-physics]]` → `/faculty/books/book-classical-physics`.
- `[[principia-official:objects:anim-pendulum]]` → `/principia-official/objects/anim-pendulum`.
- `[[old-style]]` → literal text (no match).
- `[[book:foo]]` → literal text (no match).
- `[[anim:foo]]` → literal text (no match).

---

## 10. Phase 7 — Plugin System Removal

### 10.1 Delete

```
plugins/                              entire directory
app/admin/objects/plugins/            already gone (admin tree deleted in Phase 5)
tests/actions/plugin-actions.test.ts
```

Check `lib/plugin-license.ts` — if it shares nothing with `lib/license.ts`, delete it and its test. If it shares helpers, factor them into `lib/license.ts` first.

### 10.2 Schema

Already handled in Phase 1: `objects.source` and `objects.pluginMeta` columns are never added in the new schema. `savedAnimations` table is never created.

### 10.3 Validations

`pluginManifestSchema` and `PluginManifest` already removed in Phase 3.

---

## 11. Phase 8 — Seed, Docs, Cleanup

### 11.1 Rewrite seed files

**`db/seed-admin.ts`** (minimal — used for production bootstrap):
1. Insert root admin user: `isRootAdmin: true`, `displayName: "Principia Official"`, `publisherSlug: "principia-official"`.
2. Insert `publishers` row: `kind: 'user'`, `userId: rootAdmin.id`, `slug: "principia-official"`.
3. Skip entirely if `SEED_ADMIN_EMAIL` is unset.

**`db/seed-demo.ts`** (full demo — used locally):
- Root admin as above.
- A non-admin user with slug `demo-user`.
- One org `principia-faculty` (creator = root admin, root admin auto-`super_admin`).
- `demo-user` added as `member` of `principia-faculty`.
- Two books owned by `principia-official`: `book-classical-physics`, `book-modern-physics`.
- Articles: `article-newton-laws`, `article-relativity-intro`, etc. All correctly prefixed.
- KAO objects: `anim-single-pendulum`, `anim-lorenz-attractor`, `object-force-diagram`, `object-periodic-table`.
- Curriculum entries linking articles into books.
- One org-private book, one private article with a user grant.
- User themes, book snapshots — same as before but using new schema shape.

All seed wikilinks in article content use the new `[[publisher:type:slug]]` syntax.

### 11.2 Update `CLAUDE.md`

Rewrite the following sections entirely:
- Routing (new URL tree)
- Authentication (new session payload, isRootAdmin, userSlug)
- Database (new tables, removed tables, ownership model)
- Server Actions (new file layout)
- Access control (new visibility model, org roles)
- Wikilinks (new syntax, examples)
- Internal articles (parentBookId instead of parentBookSlug)
- Remove: "Animation plugin registry" section
- Remove: "Admin sub-routes" list
- Add: "Publisher model" section
- Add: "Organizations and roles" section

### 11.3 Cleanup pass

Run these searches and verify every hit is correct:

```bash
grep -r "isAdmin" app/ lib/ components/ tests/    # must be zero (replaced by isRootAdmin or canEditContent)
grep -r "bookSlug" app/ lib/ components/ tests/   # must be zero (replaced by bookId or books.slug)
grep -r "parentBookSlug" app/ lib/ db/            # must be zero (replaced by parentBookId)
grep -r "/admin/" app/ components/                 # must be zero (no admin routes remain)
grep -r "\[\[book:" app/ db/                       # must be zero (old wikilink syntax)
grep -r "\[\[anim:" app/ db/                       # must be zero
grep -r "source.*plugin" db/                       # must be zero
```

### 11.4 Final verification

```bash
npm run lint
npm run test:run
npm run build
npm run seed
```

Manual smoke test:
1. Visit `/`, see homepage.
2. Go to `/signup`, create account with slug `alice`.
3. Land on `/alice` — profile page renders.
4. Create article `article-hello` at `/alice/articles/new`.
5. Visit `/alice/articles/article-hello` — renders.
6. Set visibility to `private`, grant access to `demo-user`.
7. Log in as `demo-user`, visit `/alice/articles/article-hello` — renders.
8. Log out, visit `/alice/articles/article-hello` — 404.
9. Root admin (`principia-official`) creates org `acme` — auto-`super_admin`, creator also `super_admin`.
10. Wikilink `[[alice:articles:article-hello]]` in an article MDX renders as a correct link.

---

## 12. Database schema (consolidated)

| Table | Status | Key changes from old schema |
|---|---|---|
| `publishers` | **NEW** | slug UNIQUE, kind, userId xor orgId |
| `users` | Modified | `isAdmin` → `isRootAdmin`; add `displayName`, `publisherSlug` |
| `organizations` | Modified | add `creatorId`, `publisherSlug` |
| `orgMemberships` | Modified | role: `'super_admin'\|'admin'\|'member'` |
| `books` | **NEW** | ownerType, ownerId, composite unique slug |
| `articles` | Modified | add ownerType, ownerId; composite slug unique; `parentBookSlug` → `parentBookId` |
| `categories` | Unchanged | — |
| `articleCategories` | Unchanged | — |
| `revisions` | Unchanged | — |
| `curriculumEntries` | Modified | drop bookSlug+bookTitle; add bookId FK |
| `objects` | Modified | add ownerType, ownerId; composite slug unique; drop source, pluginMeta |
| `userThemes` | Unchanged | — |
| `bookSnapshots` | Modified | drop bookSlug+bookTitle; add bookId FK |
| `bookSnapshotEntries` | Unchanged | — |
| `pdfCaches` | Modified | drop bookSlug; add bookId FK |
| `resourceVisibility` | Modified | `isPrivate` → `visibility` enum; add ownerType, ownerId |
| `accessGrants` | Modified | add ownerType, ownerId to scope grants |
| `articleViews` | **NEW** | articleId FK, viewedAt — powers the monthly top-5 on homepage |
| `savedAnimations` | **DROPPED** | dead table |

---

## 13. Files added / modified / deleted

### Added
- `db/schema.ts` (full rewrite)
- `lib/publisher.ts`, `lib/roles.ts`, `lib/search.ts`
- `app/signup/page.tsx`, `app/signup/actions.ts`
- `app/organizations/page.tsx`, `app/organizations/new/page.tsx`, `app/organizations/actions.ts`
- `app/[publisher]/page.tsx`
- `app/[publisher]/articles/` tree + `actions.ts`
- `app/[publisher]/books/` tree + `actions.ts` + nested access/snapshots/sync
- `app/[publisher]/objects/` tree + `actions.ts`
- `app/api/publishers/[publisher]/books/[slug]/export/` (4 routes)
- `app/api/publishers/[publisher]/animations/[slug]/route.ts`
- New test files (see §14)

### Modified
- `lib/auth.ts`, `lib/access.ts`, `lib/validations.ts`, `lib/remark-wikilinks.ts`
- `lib/useAnimationSrc.ts`
- `middleware.ts`
- `components/Nav.tsx`, `components/DynamicAnimation.tsx`, `components/CommandPalette.tsx`
- `app/login/actions.ts`
- `app/page.tsx` (homepage updated for new URL structure)
- `app/search/page.tsx`, `app/category/[...slug]/page.tsx` (owner-scoped URLs in results)
- `db/seed-admin.ts`, `db/seed-demo.ts`
- `CLAUDE.md`
- All affected tests

### Deleted
- `app/admin/` (entire tree)
- `app/[slug]/page.tsx`
- `app/curriculum/` (entire tree)
- `app/objects/` (entire tree)
- `app/api/curriculum/`, `app/api/objects/`, `app/api/animations/`
- `plugins/` (entire directory)
- `tests/actions/admin-actions.test.ts`
- `tests/actions/access-actions.test.ts`
- `tests/actions/plugin-actions.test.ts`
- Possibly `lib/plugin-license.ts` and its test (verify usage first)

---

## 14. Test update plan

| Test file | Action |
|---|---|
| `tests/lib/auth.test.ts` | UPDATE — new payload shape, stale-cookie defensive check |
| `tests/middleware.test.ts` | UPDATE — remove admin gate cases, add signup rate-limit |
| `tests/lib/access.test.ts` | REWRITE — new visibility model and canView API |
| `tests/lib/remark-wikilinks.test.ts` | REWRITE — new syntax |
| `tests/lib/validations.test.ts` | UPDATE — new slug schemas, updated existing schemas |
| `tests/lib/theme.test.ts` | KEEP |
| `tests/lib/frontmatter.test.ts` | KEEP |
| `tests/lib/article-sections.test.ts` | KEEP |
| `tests/lib/book-toc.test.ts` | UPDATE — bookId lookups |
| `tests/lib/useAnimationSrc.test.ts` | UPDATE — publisher param |
| `tests/lib/validate-animation.test.ts` | KEEP |
| `tests/lib/license.test.ts` | KEEP |
| `tests/lib/pagination.test.ts` | KEEP |
| `tests/lib/rate-limit.test.ts` | KEEP |
| `tests/lib/build-book-bundle.test.ts` | UPDATE — bookId |
| `tests/lib/epub.test.ts` | UPDATE — bookId |
| `tests/lib/plugin-license.test.ts` | DELETE (if lib deleted) |
| `tests/actions/admin-actions.test.ts` | DELETE |
| `tests/actions/access-actions.test.ts` | DELETE |
| `tests/actions/plugin-actions.test.ts` | DELETE |
| `tests/actions/kao-actions.test.ts` | UPDATE — new path, slug prefix validation |
| `tests/actions/settings-actions.test.ts` | KEEP |
| `tests/actions/sync-import-actions.test.ts` | UPDATE — new path, bookId |
| `tests/api/curriculum-pdf-route.test.ts` | UPDATE — new URL path |
| `tests/api/curriculum-epub-route.test.ts` | UPDATE — new URL path |
| `tests/api/bundle-route.test.ts` | UPDATE — new URL path |
| `tests/api/animations-route.test.ts` | UPDATE — new URL path |
| **NEW** `tests/actions/signup-actions.test.ts` | ADD |
| **NEW** `tests/actions/articles-actions.test.ts` | ADD |
| **NEW** `tests/actions/books-actions.test.ts` | ADD |
| **NEW** `tests/actions/objects-actions.test.ts` | ADD |
| **NEW** `tests/actions/org-actions.test.ts` | ADD |
| **NEW** `tests/actions/access-grants-actions.test.ts` | ADD |
| **NEW** `tests/lib/roles.test.ts` | ADD |
| **NEW** `tests/lib/publisher.test.ts` | ADD |

**Recurring patterns (unchanged from existing suite):**
- `// @vitest-environment node` on any file importing auth/jose.
- `vi.hoisted()` for mock variables in `vi.mock()` factories.
- Drizzle chain mocks: intermediate steps use `mockReturnValue`, terminals use `mockResolvedValue`.
- Redirect tests: `expect(action(formData)).rejects.toThrow("NEXT_REDIRECT")`.
- Mechanical: replace `isAdmin: true` → `isRootAdmin: true` and add `userSlug: "test-admin"` in all mocked sessions.

---

## 15. Executable checklist

**Phase 1 — Schema**
1. Drop DB, recreate, delete `drizzle/` directory.
2. Rewrite `db/schema.ts` from scratch (§4.2).
3. `npx drizzle-kit generate && npx drizzle-kit migrate`.
4. Verify with drizzle-kit studio.

**Phase 2 — Auth**
5. Rewrite `lib/auth.ts` — new payload + helpers.
6. Update `middleware.ts` — drop admin gate, update allowEval heuristic.
7. Update `app/login/actions.ts`.
8. Add `app/signup/page.tsx` + `app/signup/actions.ts`.
9. Add `signupSchema` to `lib/validations.ts`.
10. Update `tests/lib/auth.test.ts`, `tests/middleware.test.ts`.
11. Add `tests/actions/signup-actions.test.ts`. Run tests.

**Phase 3 — Validations + helpers**
12. Update `lib/validations.ts` — slug schemas, updated existing schemas, remove plugin schemas.
13. Add `lib/publisher.ts` + `tests/lib/publisher.test.ts`.
14. Add `lib/roles.ts` + `tests/lib/roles.test.ts`.

**Phase 4 — Access**
15. Rewrite `lib/access.ts`.
16. Rewrite `tests/lib/access.test.ts`. Run tests.

**Phase 5 — Routes + actions**
17. Mechanical: find/replace `isAdmin` → `isRootAdmin` and `userSlug: "test-admin"` across all test files.
18. Add `app/[publisher]/page.tsx` skeleton.
19. Build `app/[publisher]/articles/` tree + `actions.ts` + tests.
20. Build `app/[publisher]/books/` tree + `actions.ts` + tests.
21. Build `app/[publisher]/objects/` tree + `actions.ts` + tests.
22. Build `app/organizations/` tree + `actions.ts` + tests.
23. Update `components/Nav.tsx`, `components/DynamicAnimation.tsx`, `components/CommandPalette.tsx`.
24. Extract `lib/search.ts` from old actions.
25. Move export API routes to new paths. Update tests.
26. Move animation API route to new path. Update tests.
27. Delete `app/[slug]/`, `app/curriculum/`, `app/objects/`, `app/admin/`, old API routes.
28. Run `npm run build` — must pass.

**Phase 6 — Wikilinks**
29. Rewrite `lib/remark-wikilinks.ts`.
30. Rewrite `tests/lib/remark-wikilinks.test.ts`. Run tests.

**Phase 7 — Plugin removal**
31. Delete `plugins/` directory.
32. Verify + conditionally delete `lib/plugin-license.ts`.
33. Delete `tests/actions/plugin-actions.test.ts`.

**Phase 8 — Seed + docs + cleanup**
34. Rewrite `db/seed-admin.ts` + `db/seed-demo.ts`.
35. Update `CLAUDE.md`.
36. Run cleanup grep checks (§11.3).
37. `npm run lint && npm run test:run && npm run build`.
38. Manual smoke test (§11.4).

---

## 16. Deferred / out of scope

- **Platform-wide admin dashboard** — root admin navigates to publishers manually; no aggregate view.
- **Old-URL redirects** — clean break, no 301s.
- **Publisher slug changes** — immutable, no rename UI.
- **Ownership transfer UI** — no UI to move content between publishers.
- **Per-org themes** — `userThemes` stays user-scoped only.
- **Email verification on signup** — not built.
- **Password reset** — not built (absent from old codebase too).
- **Audit log for role changes** — not built.
- **Org-to-org grants** — grants table supports it but no UI.

---

## 17. Pitfalls

1. **Circular FK between `users` and `publishers`** — avoided by storing `publisherSlug` as a denormalised text column on `users`/`organizations` rather than a FK. The `publishers` table holds the canonical FK back to the user/org row.
2. **Composite unique on `(ownerType, ownerId, slug)` can't express the conditional FK** — enforced at the application layer in `canEditContent` and the action auth pattern. Add an integration test that attempts to insert content for a non-existent owner.
3. **`org` visibility on user-owned content** — must be rejected in `setResourceVisibility`. Add a Zod refinement and a test.
4. **`createOrganization` must insert two `orgMemberships` rows** — org creator as `super_admin`, AND root admin as `super_admin` (if they're different people). Wrap in a transaction. If creator IS root admin, only one row.
5. **`super_admin` protection** — any action that updates or deletes an `orgMemberships` row must call `isSuperAdminProtected()` first. Centralised in `lib/roles.ts` so it can't be forgotten per-action.
6. **`DynamicAnimation` requires publisher prop** — no legacy fallback. Any MDX article with `<DynamicAnimation>` must supply the publisher. The new seed and new article editor enforce this. Old articles become broken — acceptable since we're starting fresh.
7. **CommandPalette `searchAll` returns publisher-prefixed URLs** — update both the function and the component in the same commit to avoid a temporary broken UI.
8. **`bookSnapshots` now cascade-deletes on book deletion** — intentional behaviour change. Call it out in `CLAUDE.md`.
9. **CSP `allowEval` heuristic** — the pattern must correctly match `/[publisher]/articles/new` without also matching random publishers. Use: `pathname.match(/^\/[^/]+\/(?:articles|objects)\/(?:new|[^/]+\/edit)$/)`.
10. **Drizzle unique index naming** — after dropping the old `articles.slug` unique and adding the composite, inspect the generated SQL for the constraint name. Postgres may complain about duplicate names if the old migration files are deleted carelessly. Starting from a clean DB and a fresh `drizzle/` folder avoids this entirely.
11. **`articleViews` table growth** — one row per article render. Fine indefinitely for a small site. If it ever grows large, delete rows older than 90 days periodically. No action needed now.
12. **Publisher profile page route collision** — `/[publisher]` catches any first-path-segment, including `/login`, `/signup`, `/search`, `/organizations`, `/pricing`, `/settings`, `/category`. These must be defined as static segments in the App Router **before** the dynamic `[publisher]` segment. Next.js resolves static routes first, so the ordering is correct — but verify no reserved publisher slug can be created (e.g. reject `login`, `signup`, `search`, `organizations`, `settings`, `category`, `pricing`, `api` as publisher slugs in `signupSchema` and `createOrganizationSchema`).
13. **Homepage top-5 query joins public articles across all publishers** — this means it must filter for `visibility = 'public'` (or absent from `resourceVisibility`) at query time. A simple `LEFT JOIN resourceVisibility` with `WHERE rv.visibility IS NULL OR rv.visibility = 'public'` handles this.

---

## 18. Definition of done

- `npm run lint`, `npm run test:run`, `npm run build` all pass.
- Fresh DB seeded with `npm run seed` — no errors.
- Manual smoke test in §11.4 passes end-to-end.
- No `/admin/**` route exists. No `[[slug]]` bare wikilink. No `plugins/` directory. No `savedAnimations` table. No `users.isAdmin` column. No globally-unique slug constraint on articles or objects.
- `CLAUDE.md` accurately reflects the new architecture.

---

*End of plan.*
