# Access Control Plan — Resource-Level ACL with Organizations

## 1. Overview

This plan adds resource-level access control to Principia Synthesia. Books (identified by `bookSlug`) and articles (identified by `slug`) become first-class permission subjects that can be marked **private**. Private resources are only viewable by their owner (an admin) or by explicit **access grants** to individual users or to **organizations** (named groups of users). Public resources keep their current behavior unchanged.

Three goals shape the design:

1. **Default-public, opt-in private** — existing rows remain viewable. A resource is private only if a `resource_visibility` row exists with `isPrivate=true`.
2. **404 not 403** — denied requests look identical to "not found" so private resources don't leak existence. The check is implemented as `notFound()` (server pages) or `new NextResponse("Not found", { status: 404 })` (route handlers).
3. **Admins bypass everything** — `session.isAdmin === true` short-circuits all visibility checks.

The implementation centers on a single server-only utility (`lib/access.ts`) used both by page/route gates and by discovery surfaces (homepage, search, category, sitemap) to filter listings.

## 2. Assumptions

These choices are made explicitly because the task description leaves them open:

- **Resource identity** — `resourceType` is one of the literals `"book" | "article"`. `resourceKey` is `bookSlug` for books and `slug` for articles. Articles do not use their numeric `id` as the key, so slug renames must be coordinated by the admin (analogous to the existing constraint that an article's slug is its public identity).
- **Internal articles** — `isInternal` articles remain governed by their parent book's visibility, not their own. There is no separate visibility row for internal articles; gating happens through `canViewBook(parentBookSlug, …)`.
- **Animations** — out of scope. Animations stay fully public for now. The schema is forward-compatible (just add `"animation"` to the `resourceType` literal later).
- **Org slug** — orgs get a unique `slug` for URLs (`/admin/access/orgs/[slug]`). Slug regex matches existing slug rules (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`).
- **Org roles** — `"owner" | "member"`. Owners and members have the same view permissions on granted resources; the role exists for future use (e.g. allowing org owners to manage membership). The admin UI surfaces the role but does not grant non-admins write access yet.
- **createUser** — creates a non-admin user with bcrypt-hashed password; admin chooses the password. There is no email verification or self-signup flow in this phase.
- **No revocation history** — when a grant is removed it is hard-deleted. `grantedBy` records who issued it but there is no audit log table.
- **404 over redirect** — unauthenticated users trying to read a private resource get 404, not a redirect to `/login`. The task brief explicitly requires "no information leakage", and a redirect would leak existence.
- **`searchAll()` does not gate animations** — only `articles` and `books` are filtered.
- **`isInternal` filtering on the homepage's "Recently updated"** — already absent from the current query but the task lists this as a fix. The plan adds `where(eq(articles.isInternal, false))` to that query. Private standalone articles are also filtered out of "Recently updated".

## 3. Architecture & Design Decisions

### 3.1 Why two tables for visibility + grants (not one)

A `resource_visibility` row is a small fast lookup (one row per private resource). `access_grants` is a fan-out table (many rows per private resource). Splitting them means:

- The fast path for public resources is a single negative lookup that returns no row.
- A resource can flip private/public without touching its grants (they remain associated and resume effect if it's re-privatised).

### 3.2 Why `granteeType` + `granteeId` instead of two FK columns

A single grant row covers both user and org grants with one schema, and the unique index `(resourceType, resourceKey, granteeType, granteeId)` naturally prevents duplicates. Drizzle has no native discriminated FK so we accept that `granteeId` is not FK-enforced; orphaned grants (deleted user/org) are cleaned up by the action that performs the deletion.

### 3.3 Why the helper returns `Set<string> | 'all'` for book listings

The homepage and search would otherwise require N queries (one per resource). The discovery helper does this:

1. Admin → returns `'all'` (no filtering).
2. Loads all `resource_visibility` rows where `isPrivate=true` for the resource type — one query.
3. Builds the set of private slugs.
4. If `userId` exists, loads matching grants for that user + their orgs — one query.
5. Returns a `Set<string>` of visible slugs that callers intersect with their own list.

Callers either use `.has(slug)` (filter) or check `=== 'all'` (no-op).

### 3.4 Why server actions, not API routes

Per the project convention, all mutations go through `"use server"` files. The new file `app/admin/access/actions.ts` follows the same Zod-validate-then-mutate-then-revalidate pattern as `app/admin/actions.ts`.

### 3.5 No new dependencies

Everything uses what's already installed: Drizzle, Zod, bcrypt, jose.

## 4. Database Changes

### 4.1 New tables in `db/schema.ts`

Append the following to `db/schema.ts` after the existing tables. Match existing style (multiline comments above each table, `pgTable` second-arg returning array for indexes).

```ts
/**
 * A named group of users. Used as a grantee for `accessGrants`.
 * Slug is unique and follows the same `kebab-case` regex as other slugs.
 */
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Junction table linking users to organizations. `role` is `"owner"` or
 * `"member"`. A user may belong to many orgs; uniqueness on (orgId, userId)
 * prevents duplicate memberships. Both sides cascade-delete.
 */
export const orgMemberships = pgTable(
  "org_memberships",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (t) => [unique().on(t.orgId, t.userId)]
);

/**
 * One row per private resource. Absent row means public (the default).
 * `resourceType` is `"book"` or `"article"`. `resourceKey` is the slug
 * (book slug or article slug). Unique on (resourceType, resourceKey).
 */
export const resourceVisibility = pgTable(
  "resource_visibility",
  {
    id: serial("id").primaryKey(),
    resourceType: text("resource_type").notNull(),
    resourceKey: text("resource_key").notNull(),
    isPrivate: boolean("is_private").default(false).notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique().on(t.resourceType, t.resourceKey)]
);

/**
 * Grants viewing access to a private resource. `granteeType` is `"user"` or
 * `"org"`. `granteeId` references either `users.id` or `organizations.id`
 * depending on `granteeType` — it is not a foreign key for that reason. The
 * unique constraint prevents duplicate grants for the same grantee on the
 * same resource. `grantedBy` is the admin who created the grant.
 */
export const accessGrants = pgTable(
  "access_grants",
  {
    id: serial("id").primaryKey(),
    resourceType: text("resource_type").notNull(),
    resourceKey: text("resource_key").notNull(),
    granteeType: text("grantee_type").notNull(),
    granteeId: integer("grantee_id").notNull(),
    grantedAt: timestamp("granted_at").defaultNow(),
    grantedBy: integer("granted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [unique().on(t.resourceType, t.resourceKey, t.granteeType, t.granteeId)]
);
```

### 4.2 Migration SQL

Because `drizzle-kit migrate` hangs locally, run the SQL directly with psql. Save the file as `drizzle/0007_access_control.sql`:

```sql
CREATE TABLE "organizations" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "org_memberships" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "role" text NOT NULL,
  "joined_at" timestamp DEFAULT now(),
  CONSTRAINT "org_memberships_org_id_user_id_unique" UNIQUE("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "resource_visibility" (
  "id" serial PRIMARY KEY NOT NULL,
  "resource_type" text NOT NULL,
  "resource_key" text NOT NULL,
  "is_private" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "resource_visibility_resource_type_resource_key_unique" UNIQUE("resource_type","resource_key")
);
--> statement-breakpoint
CREATE TABLE "access_grants" (
  "id" serial PRIMARY KEY NOT NULL,
  "resource_type" text NOT NULL,
  "resource_key" text NOT NULL,
  "grantee_type" text NOT NULL,
  "grantee_id" integer NOT NULL,
  "granted_at" timestamp DEFAULT now(),
  "granted_by" integer,
  CONSTRAINT "access_grants_resource_type_resource_key_grantee_type_grantee_id_unique" UNIQUE("resource_type","resource_key","grantee_type","grantee_id")
);
--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "resource_visibility_lookup_idx" ON "resource_visibility" ("resource_type","resource_key");
--> statement-breakpoint
CREATE INDEX "access_grants_resource_lookup_idx" ON "access_grants" ("resource_type","resource_key");
--> statement-breakpoint
CREATE INDEX "access_grants_grantee_lookup_idx" ON "access_grants" ("grantee_type","grantee_id");
--> statement-breakpoint
CREATE INDEX "org_memberships_user_idx" ON "org_memberships" ("user_id");
```

Apply with:

```bash
psql "$DATABASE_URL" -f drizzle/0007_access_control.sql
```

Also append a corresponding entry to `drizzle/meta/_journal.json` (idx incremented by one, `when` set to current timestamp, `tag` set to `0007_access_control`). If the journal cannot be edited by hand, run `npx drizzle-kit generate` after updating the schema to regenerate it — but use the manually written SQL file above for the actual table creation since the auto-generated one may differ in ordering.

## 5. Validation Schemas

Append to `lib/validations.ts`:

```ts
export const setVisibilitySchema = z.object({
  resourceType: z.enum(["book", "article"]),
  resourceKey: z.string().min(1, "Resource key is required"),
  isPrivate: z.coerce.boolean(),
});

export const addAccessGrantSchema = z.object({
  resourceType: z.enum(["book", "article"]),
  resourceKey: z.string().min(1, "Resource key is required"),
  granteeType: z.enum(["user", "org"]),
  granteeId: z.coerce.number().int().positive("Invalid grantee ID"),
});

export const removeAccessGrantSchema = z.object({
  grantId: z.coerce.number().int().positive("Invalid grant ID"),
});

export const createOrganizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only"),
});

export const deleteOrganizationSchema = z.object({
  orgId: z.coerce.number().int().positive("Invalid org ID"),
});

export const addOrgMemberSchema = z.object({
  orgId: z.coerce.number().int().positive("Invalid org ID"),
  userId: z.coerce.number().int().positive("Invalid user ID"),
  role: z.enum(["owner", "member"]),
});

export const removeOrgMemberSchema = z.object({
  membershipId: z.coerce.number().int().positive("Invalid membership ID"),
});

export const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
```

## 6. The `lib/access.ts` Utility (Server-Only)

Create `lib/access.ts`. It is imported only by server components, route handlers, and server actions — never by client components.

```ts
import "server-only";
import { db } from "@/db";
import { resourceVisibility, accessGrants, orgMemberships } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { SessionPayload } from "@/lib/auth";

type ResourceType = "book" | "article";

async function isPrivate(resourceType: ResourceType, resourceKey: string): Promise<boolean> {
  const rows = await db
    .select({ isPrivate: resourceVisibility.isPrivate })
    .from(resourceVisibility)
    .where(
      and(
        eq(resourceVisibility.resourceType, resourceType),
        eq(resourceVisibility.resourceKey, resourceKey)
      )
    )
    .limit(1);
  return rows[0]?.isPrivate ?? false;
}

async function getUserOrgIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ orgId: orgMemberships.orgId })
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId));
  return rows.map((r) => r.orgId);
}

async function hasGrant(
  resourceType: ResourceType,
  resourceKey: string,
  userId: number,
  orgIds: number[]
): Promise<boolean> {
  const userMatch = and(
    eq(accessGrants.resourceType, resourceType),
    eq(accessGrants.resourceKey, resourceKey),
    eq(accessGrants.granteeType, "user"),
    eq(accessGrants.granteeId, userId)
  );

  const userRow = await db.select({ id: accessGrants.id }).from(accessGrants).where(userMatch).limit(1);
  if (userRow[0]) return true;

  if (orgIds.length === 0) return false;

  const orgRow = await db
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.resourceType, resourceType),
        eq(accessGrants.resourceKey, resourceKey),
        eq(accessGrants.granteeType, "org"),
        inArray(accessGrants.granteeId, orgIds)
      )
    )
    .limit(1);
  return !!orgRow[0];
}

export async function canViewBook(bookSlug: string, session: SessionPayload | null): Promise<boolean> {
  if (session?.isAdmin) return true;
  if (!(await isPrivate("book", bookSlug))) return true;
  if (!session?.userId) return false;
  const orgIds = await getUserOrgIds(session.userId);
  return hasGrant("book", bookSlug, session.userId, orgIds);
}

export async function canViewArticle(articleSlug: string, session: SessionPayload | null): Promise<boolean> {
  if (session?.isAdmin) return true;
  if (!(await isPrivate("article", articleSlug))) return true;
  if (!session?.userId) return false;
  const orgIds = await getUserOrgIds(session.userId);
  return hasGrant("article", articleSlug, session.userId, orgIds);
}

export async function getVisibleBookSlugs(
  session: SessionPayload | null,
  allSlugs: string[]
): Promise<Set<string> | "all"> {
  if (session?.isAdmin) return "all";
  if (allSlugs.length === 0) return new Set();

  const privateRows = await db
    .select({ resourceKey: resourceVisibility.resourceKey })
    .from(resourceVisibility)
    .where(
      and(
        eq(resourceVisibility.resourceType, "book"),
        eq(resourceVisibility.isPrivate, true),
        inArray(resourceVisibility.resourceKey, allSlugs)
      )
    );
  const privateSet = new Set(privateRows.map((r) => r.resourceKey));

  const publicSlugs = allSlugs.filter((s) => !privateSet.has(s));
  const visible = new Set(publicSlugs);

  if (!session?.userId || privateSet.size === 0) return visible;

  const orgIds = await getUserOrgIds(session.userId);

  const userGrants = await db
    .select({ resourceKey: accessGrants.resourceKey })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.resourceType, "book"),
        eq(accessGrants.granteeType, "user"),
        eq(accessGrants.granteeId, session.userId),
        inArray(accessGrants.resourceKey, Array.from(privateSet))
      )
    );
  for (const g of userGrants) visible.add(g.resourceKey);

  if (orgIds.length > 0) {
    const orgGrants = await db
      .select({ resourceKey: accessGrants.resourceKey })
      .from(accessGrants)
      .where(
        and(
          eq(accessGrants.resourceType, "book"),
          eq(accessGrants.granteeType, "org"),
          inArray(accessGrants.granteeId, orgIds),
          inArray(accessGrants.resourceKey, Array.from(privateSet))
        )
      );
    for (const g of orgGrants) visible.add(g.resourceKey);
  }

  return visible;
}

export async function getVisibleArticleSlugs(
  session: SessionPayload | null,
  allSlugs: string[]
): Promise<Set<string> | "all"> {
  // Same shape as getVisibleBookSlugs but for resourceType "article".
  // Implementation mirrors above with "article" substituted for "book".
  // Used by search, category, and sitemap filtering.
  if (session?.isAdmin) return "all";
  if (allSlugs.length === 0) return new Set();

  const privateRows = await db
    .select({ resourceKey: resourceVisibility.resourceKey })
    .from(resourceVisibility)
    .where(
      and(
        eq(resourceVisibility.resourceType, "article"),
        eq(resourceVisibility.isPrivate, true),
        inArray(resourceVisibility.resourceKey, allSlugs)
      )
    );
  const privateSet = new Set(privateRows.map((r) => r.resourceKey));

  const publicSlugs = allSlugs.filter((s) => !privateSet.has(s));
  const visible = new Set(publicSlugs);

  if (!session?.userId || privateSet.size === 0) return visible;

  const orgIds = await getUserOrgIds(session.userId);

  const userGrants = await db
    .select({ resourceKey: accessGrants.resourceKey })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.resourceType, "article"),
        eq(accessGrants.granteeType, "user"),
        eq(accessGrants.granteeId, session.userId),
        inArray(accessGrants.resourceKey, Array.from(privateSet))
      )
    );
  for (const g of userGrants) visible.add(g.resourceKey);

  if (orgIds.length > 0) {
    const orgGrants = await db
      .select({ resourceKey: accessGrants.resourceKey })
      .from(accessGrants)
      .where(
        and(
          eq(accessGrants.resourceType, "article"),
          eq(accessGrants.granteeType, "org"),
          inArray(accessGrants.granteeId, orgIds),
          inArray(accessGrants.resourceKey, Array.from(privateSet))
        )
      );
    for (const g of orgGrants) visible.add(g.resourceKey);
  }

  return visible;
}
```

The `"server-only"` import is the standard Next.js guard that throws if a client component imports this module by accident.

`getVisibleArticleSlugs` is added because the task brief requires search, category, and sitemap filtering for articles too — without a batched helper those listings would N+1.

## 7. Server Actions

Create `app/admin/access/actions.ts` with `"use server"` at the top. Each action:

1. Calls `getSession()` and throws if `!session?.isAdmin` (the middleware already blocks the URL, but actions can be called from anywhere — defense in depth).
2. Validates the input with the appropriate Zod schema.
3. Runs the mutation.
4. Revalidates the relevant paths.

```ts
"use server";

import { db } from "@/db";
import {
  resourceVisibility,
  accessGrants,
  organizations,
  orgMemberships,
  users,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import {
  setVisibilitySchema,
  addAccessGrantSchema,
  removeAccessGrantSchema,
  createOrganizationSchema,
  deleteOrganizationSchema,
  addOrgMemberSchema,
  removeOrgMemberSchema,
  createUserSchema,
} from "@/lib/validations";

async function requireAdmin() {
  const session = await getSession();
  if (!session?.isAdmin) throw new Error("Unauthorized");
  return session;
}

export async function setResourceVisibility(formData: FormData) {
  await requireAdmin();
  const validated = setVisibilitySchema.parse({
    resourceType: formData.get("resourceType"),
    resourceKey: formData.get("resourceKey"),
    isPrivate: formData.get("isPrivate") === "true",
  });

  const existing = await db
    .select({ id: resourceVisibility.id })
    .from(resourceVisibility)
    .where(
      and(
        eq(resourceVisibility.resourceType, validated.resourceType),
        eq(resourceVisibility.resourceKey, validated.resourceKey)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(resourceVisibility)
      .set({ isPrivate: validated.isPrivate, updatedAt: new Date() })
      .where(eq(resourceVisibility.id, existing[0].id));
  } else {
    await db.insert(resourceVisibility).values({
      resourceType: validated.resourceType,
      resourceKey: validated.resourceKey,
      isPrivate: validated.isPrivate,
    });
  }

  if (validated.resourceType === "book") {
    revalidatePath(`/curriculum/${validated.resourceKey}`);
    revalidatePath(`/admin/curriculum/${validated.resourceKey}/access`);
  } else {
    revalidatePath(`/${validated.resourceKey}`);
  }
  revalidatePath("/");
}

export async function addAccessGrant(formData: FormData) {
  const session = await requireAdmin();
  const validated = addAccessGrantSchema.parse({
    resourceType: formData.get("resourceType"),
    resourceKey: formData.get("resourceKey"),
    granteeType: formData.get("granteeType"),
    granteeId: formData.get("granteeId"),
  });

  await db
    .insert(accessGrants)
    .values({
      resourceType: validated.resourceType,
      resourceKey: validated.resourceKey,
      granteeType: validated.granteeType,
      granteeId: validated.granteeId,
      grantedBy: session.userId,
    })
    .onConflictDoNothing();

  if (validated.resourceType === "book") {
    revalidatePath(`/admin/curriculum/${validated.resourceKey}/access`);
  }
}

export async function removeAccessGrant(formData: FormData) {
  await requireAdmin();
  const validated = removeAccessGrantSchema.parse({
    grantId: formData.get("grantId"),
  });

  const grant = await db
    .select({ resourceType: accessGrants.resourceType, resourceKey: accessGrants.resourceKey })
    .from(accessGrants)
    .where(eq(accessGrants.id, validated.grantId))
    .limit(1);

  await db.delete(accessGrants).where(eq(accessGrants.id, validated.grantId));

  if (grant[0]?.resourceType === "book") {
    revalidatePath(`/admin/curriculum/${grant[0].resourceKey}/access`);
  }
}

export async function createOrganization(formData: FormData) {
  await requireAdmin();
  const validated = createOrganizationSchema.parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });

  await db.insert(organizations).values({
    name: validated.name,
    slug: validated.slug,
  });

  revalidatePath("/admin/access/orgs");
  redirect(`/admin/access/orgs/${validated.slug}`);
}

export async function deleteOrganization(formData: FormData) {
  await requireAdmin();
  const validated = deleteOrganizationSchema.parse({
    orgId: formData.get("orgId"),
  });

  await db.delete(accessGrants).where(
    and(eq(accessGrants.granteeType, "org"), eq(accessGrants.granteeId, validated.orgId))
  );
  await db.delete(organizations).where(eq(organizations.id, validated.orgId));

  revalidatePath("/admin/access/orgs");
  redirect("/admin/access/orgs");
}

export async function addOrgMember(formData: FormData) {
  await requireAdmin();
  const validated = addOrgMemberSchema.parse({
    orgId: formData.get("orgId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  await db
    .insert(orgMemberships)
    .values({
      orgId: validated.orgId,
      userId: validated.userId,
      role: validated.role,
    })
    .onConflictDoNothing();

  const org = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, validated.orgId))
    .limit(1);
  if (org[0]) revalidatePath(`/admin/access/orgs/${org[0].slug}`);
}

export async function removeOrgMember(formData: FormData) {
  await requireAdmin();
  const validated = removeOrgMemberSchema.parse({
    membershipId: formData.get("membershipId"),
  });

  const membership = await db
    .select({ orgId: orgMemberships.orgId })
    .from(orgMemberships)
    .where(eq(orgMemberships.id, validated.membershipId))
    .limit(1);

  await db.delete(orgMemberships).where(eq(orgMemberships.id, validated.membershipId));

  if (membership[0]) {
    const org = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, membership[0].orgId))
      .limit(1);
    if (org[0]) revalidatePath(`/admin/access/orgs/${org[0].slug}`);
  }
}

export async function createUser(formData: FormData) {
  await requireAdmin();
  const validated = createUserSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const passwordHash = await hashPassword(validated.password);
  await db.insert(users).values({
    email: validated.email,
    passwordHash,
    isAdmin: false,
  });

  revalidatePath("/admin/access/users");
}
```

The `requireAdmin()` helper centralizes the auth check. Throwing `Error("Unauthorized")` is sufficient — non-admins hitting these actions would be a programmer error, and Next.js bubbles the error to the error boundary.

## 8. Gating Existing Routes

### 8.1 `app/curriculum/[book]/page.tsx`

After the existing `entries.length === 0` check, before returning JSX:

```ts
import { getSession } from "@/lib/auth";
import { canViewBook } from "@/lib/access";
// ...
const session = await getSession();
if (!(await canViewBook(bookSlug, session))) notFound();
```

### 8.2 `app/curriculum/[book]/[slug]/page.tsx`

After loading the article and `entry`, before rendering. Internal articles are governed by their parent book. The session fetch already exists; just add:

```ts
if (!(await canViewBook(bookSlug, session))) notFound();
```

### 8.3 `app/[slug]/page.tsx`

After `if (article.isInternal) notFound();`:

```ts
import { canViewArticle } from "@/lib/access";
// ...
if (!(await canViewArticle(slug, session))) notFound();
```

### 8.4 `app/api/curriculum/[book]/export/pdf/route.ts` and `epub/route.ts`

At the very top of the `GET` function, before the entries query:

```ts
import { getSession } from "@/lib/auth";
import { canViewBook } from "@/lib/access";
// ...
const session = await getSession();
if (!(await canViewBook(bookSlug, session))) {
  return new NextResponse("Not found", { status: 404 });
}
```

The existing `entries.length === 0` 404 check stays — it still returns the same status for genuinely missing books, preserving the no-leakage property.

## 9. Discovery Filtering

### 9.1 `app/page.tsx`

- The existing `entries` query returns every curriculum entry. After loading it, derive `allBookSlugs`, call `getVisibleBookSlugs(session, allBookSlugs)`, and filter the `books` record before building `bookList`.
- For the `recent` query, also exclude internal articles and private articles. Pull the visible article slugs via `getVisibleArticleSlugs` on the recent set after fetching.

Concretely:

```ts
import { getVisibleBookSlugs, getVisibleArticleSlugs } from "@/lib/access";
import { and } from "drizzle-orm";
// ...
const recent = await db
  .select({ /* ... */ })
  .from(articles)
  .where(eq(articles.isInternal, false))
  .orderBy(desc(articles.updatedAt))
  .limit(24);  // fetch more, then trim after filtering

const visibleRecentSlugs = await getVisibleArticleSlugs(session, recent.map((a) => a.slug));
const filteredRecent = (visibleRecentSlugs === "all"
  ? recent
  : recent.filter((a) => visibleRecentSlugs.has(a.slug))
).slice(0, 8);

const visibleBookSlugs = await getVisibleBookSlugs(session, [...new Set(entries.map((e) => e.bookSlug))]);
const filteredEntries = visibleBookSlugs === "all"
  ? entries
  : entries.filter((e) => visibleBookSlugs.has(e.bookSlug));
// then build `books` record from filteredEntries instead of entries
```

The article-count `total` query should also be recomputed from `filteredRecent.length` plus the unfiltered public count, or simply reflect the count after filtering. Decision: leave the `total` query alone — it counts admin-visible totals which is acceptable since the number is informational.

### 9.2 `app/search/page.tsx`

After running the existing query, batch-filter the results:

```ts
import { getSession } from "@/lib/auth";
import { getVisibleArticleSlugs, getVisibleBookSlugs } from "@/lib/access";
// ...
const session = await getSession();
const visibleArticles = await getVisibleArticleSlugs(session, results.map((a) => a.slug));
const filtered = visibleArticles === "all"
  ? results
  : results.filter((a) => visibleArticles.has(a.slug));
```

Replace `results` with `filtered` in the JSX. Note: the current query already excludes `isInternal = true`. To additionally hide articles that belong to a private book, the search action would need to join `curriculumEntries` and filter against `getVisibleBookSlugs`. Add that as a second pass:

```ts
// Map each result slug to any book it belongs to.
const articleBookSlugs = await db
  .select({ articleSlug: articles.slug, bookSlug: curriculumEntries.bookSlug })
  .from(articles)
  .innerJoin(curriculumEntries, eq(curriculumEntries.articleId, articles.id))
  .where(inArray(articles.slug, filtered.map((a) => a.slug)));

const allBookSlugs = [...new Set(articleBookSlugs.map((r) => r.bookSlug))];
const visibleBooks = await getVisibleBookSlugs(session, allBookSlugs);
const articleToBooks = new Map<string, string[]>();
for (const r of articleBookSlugs) {
  const list = articleToBooks.get(r.articleSlug) ?? [];
  list.push(r.bookSlug);
  articleToBooks.set(r.articleSlug, list);
}
const finalResults = filtered.filter((a) => {
  const books = articleToBooks.get(a.slug);
  if (!books || books.length === 0) return true; // standalone article — already gated above
  if (visibleBooks === "all") return true;
  return books.some((b) => visibleBooks.has(b));
});
```

### 9.3 `app/category/[...slug]/page.tsx`

Same two-pass filter as search: article visibility, then book-membership visibility.

### 9.4 `app/sitemap.ts`

Only include public resources. The sitemap runs without a session — call the helpers with `null`:

```ts
import { getVisibleArticleSlugs, getVisibleBookSlugs } from "@/lib/access";
// ...
const articleVisibility = await getVisibleArticleSlugs(null, allArticles.map((a) => a.slug));
const publicArticles = articleVisibility === "all"
  ? allArticles
  : allArticles.filter((a) => articleVisibility.has(a.slug));

const bookSlugsRaw = [...new Set(allEntries.map((e) => e.bookSlug))];
const bookVisibility = await getVisibleBookSlugs(null, bookSlugsRaw);
const bookSlugs = bookVisibility === "all" ? bookSlugsRaw : bookSlugsRaw.filter((s) => bookVisibility.has(s));
```

(`articleVisibility === "all"` cannot happen when `session` is null but the branch is kept for symmetry and TypeScript narrowing.)

### 9.5 `searchAll()` in `app/admin/actions.ts`

The command palette is mounted everywhere, including for non-admins. Inject visibility filtering:

```ts
import { getSession } from "@/lib/auth";
import { getVisibleArticleSlugs, getVisibleBookSlugs } from "@/lib/access";
// ...
export async function searchAll(query: string) {
  const session = await getSession();
  const q = `%${query}%`;
  // ... (existing parallel queries)

  if (session?.isAdmin) return { articles: articleRows, books: bookRows, animations: animationRows };

  const visibleArticles = await getVisibleArticleSlugs(session, articleRows.map((a) => a.slug));
  const visibleBooks = await getVisibleBookSlugs(session, bookRows.map((b) => b.bookSlug));

  return {
    articles: visibleArticles === "all" ? articleRows : articleRows.filter((a) => visibleArticles.has(a.slug)),
    books: visibleBooks === "all" ? bookRows : bookRows.filter((b) => visibleBooks.has(b.bookSlug)),
    animations: animationRows,
  };
}
```

## 10. Admin UI Pages

All admin pages use server components, follow the existing styling (`max-w-3xl mx-auto px-4 py-10`, themed Tailwind classes), and post forms to actions in `app/admin/access/actions.ts`.

### 10.1 `app/admin/curriculum/[book]/access/page.tsx`

Page contents:

1. Fetch the book title from `curriculumEntries` (404 if no rows).
2. Fetch `resource_visibility` row for `("book", bookSlug)` to determine current `isPrivate`.
3. Fetch all `access_grants` for `("book", bookSlug)`.
4. For each grant, hydrate the grantee:
   - `granteeType === "user"` → join `users.email`
   - `granteeType === "org"` → join `organizations.name` and `organizations.slug`
5. Fetch the lists of all users and all organizations for the "add grant" form.

Render:
- Header with breadcrumb back to `/admin/curriculum`.
- A form posting to `setResourceVisibility` with a hidden `resourceType=book`, `resourceKey={bookSlug}`, and an `isPrivate` toggle (radio buttons or a checkbox). The submit button is "Save visibility".
- A grants table with a "Remove" button (form posting to `removeAccessGrant`).
- An "Add grant" form posting to `addAccessGrant`. Includes a select for grantee type (`user`/`org`) and a second select populated with users or orgs respectively. To keep this server-rendered, render two forms side-by-side ("Grant to user" and "Grant to org") rather than one with dynamic select.

### 10.2 `app/admin/access/page.tsx`

A simple landing page with two links and short descriptions:
- `Organizations` → `/admin/access/orgs`
- `Users` → `/admin/access/users`

Use the same layout as other admin pages.

### 10.3 `app/admin/access/orgs/page.tsx`

- List all rows from `organizations` with link to `/admin/access/orgs/[slug]`.
- A form posting to `createOrganization` with `name` and `slug` inputs.

### 10.4 `app/admin/access/orgs/[slug]/page.tsx`

`params` is `Promise<{ slug: string }>`, await it.

- Fetch the org by slug; `notFound()` if missing.
- Fetch all `orgMemberships` for that org joined with `users.email`.
- Fetch all users (for the "add member" select), excluding existing members.

Render:
- Org name + slug.
- A `deleteOrganization` form (hidden `orgId`).
- A members table with role badge and "Remove" form (`removeOrgMember`, hidden `membershipId`).
- An "Add member" form posting to `addOrgMember` (hidden `orgId`, `userId` select, `role` select with options `owner`/`member`).

### 10.5 `app/admin/access/users/page.tsx`

- List all users (id, email, isAdmin flag).
- A `createUser` form (`email`, `password`).

### 10.6 Updating `app/admin/curriculum/page.tsx`

Next to each book heading (where `DeleteBookButton` currently lives), add:

```tsx
<Link
  href={`/admin/curriculum/${bookSlug}/access`}
  className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
  aria-label={`Manage access for ${book.bookTitle}`}
>
  🔒 Access
</Link>
```

To indicate private state, fetch the visibility map up-front for all listed bookSlugs:

```ts
const visibilityRows = await db
  .select({ resourceKey: resourceVisibility.resourceKey, isPrivate: resourceVisibility.isPrivate })
  .from(resourceVisibility)
  .where(and(eq(resourceVisibility.resourceType, "book"), inArray(resourceVisibility.resourceKey, bookList.map(([s]) => s))));
const privateMap = new Map(visibilityRows.map((r) => [r.resourceKey, r.isPrivate]));
```

Show a small "Private" pill when `privateMap.get(bookSlug) === true`.

## 11. Routing Summary

| Path | Purpose | Auth |
| ---- | ------- | ---- |
| `/admin/curriculum/[book]/access` | per-book access controls | admin (middleware) |
| `/admin/access` | landing | admin |
| `/admin/access/orgs` | list/create orgs | admin |
| `/admin/access/orgs/[slug]` | manage org members | admin |
| `/admin/access/users` | list/create users | admin |

All sit under `/admin/**`, so the existing middleware JWT check already gates them. No middleware changes are needed.

## 12. Middleware / Auth Changes

None. The existing `middleware.ts` already protects `/admin/**`. `getSession()` is unchanged. `SessionPayload` remains `{ userId, email, isAdmin }`.

A future enhancement could include org memberships in the JWT payload to skip the `getUserOrgIds` query, but that complicates token invalidation when memberships change — keep the runtime query for now.

## 13. Tests

All tests follow existing patterns under `tests/`. Use `// @vitest-environment node` for any test that touches `getSession()` (which uses `jose`).

### 13.1 `tests/lib/access.test.ts` (new, node env)

Mocks: `@/db` (Drizzle chain mocks per the existing pattern), `drizzle-orm` operators. No `next/*` mocks needed.

Cases for `canViewBook`:
- admin session → true without DB hit
- no visibility row → true (public default)
- visibility row with `isPrivate=false` → true
- private + no session → false
- private + session has user grant → true
- private + session has org grant via membership → true
- private + session has neither → false

Mirror the same matrix for `canViewArticle`.

Cases for `getVisibleBookSlugs`:
- admin → `"all"`
- empty input → empty Set
- mix of public and private with no grants → only public slugs returned
- private + user grant → grant slug included
- private + org grant + member of org → grant slug included

Use the `vi.hoisted` mock helpers shape from `tests/actions/admin-actions.test.ts`. The Drizzle chain for the visibility query is `select().from().where()` (terminal) so `mockSelectFromWhere` should be `mockResolvedValue` for that path.

### 13.2 `tests/actions/access-actions.test.ts` (new, node env)

Mock `@/db`, `next/cache`, `next/navigation`, `@/lib/auth` (mock `getSession`), and `drizzle-orm` operators.

For each action:
- happy-path success → DB called with expected values, `revalidatePath` called
- non-admin session → throws `"Unauthorized"` and DB not touched
- invalid input (Zod failure) → throws ZodError
- `createOrganization`/`deleteOrganization` → also assert the redirect (use the `NEXT_REDIRECT` throw pattern)

Match the helper-function style (`setupInsert`, `setupSelect`, `setupDelete`) from `admin-actions.test.ts`.

### 13.3 `tests/api/curriculum-pdf-route.test.ts` and `curriculum-epub-route.test.ts` (extend)

Add cases:
- private book + no session → 404
- private book + session with grant → existing happy path still works

Mock `@/lib/auth.getSession` and `@/lib/access.canViewBook` (or let access.ts run against the mocked DB).

### 13.4 Page-level tests

Page tests are not part of the existing test suite — no need to add them. Coverage on the gates is via the action and lib tests plus manual smoke-test in the implementation checklist.

## 14. Implementation Order

1. **Schema** — append the four new tables to `db/schema.ts`.
2. **Migration** — write `drizzle/0007_access_control.sql` and apply with `psql "$DATABASE_URL" -f drizzle/0007_access_control.sql`. Update `drizzle/meta/_journal.json` to keep drizzle-kit in sync.
3. **Validations** — append all eight new schemas to `lib/validations.ts`.
4. **Access utility** — create `lib/access.ts` with `canViewBook`, `canViewArticle`, `getVisibleBookSlugs`, `getVisibleArticleSlugs`.
5. **Tests for access utility** — `tests/lib/access.test.ts`. Make these pass before moving on.
6. **Server actions** — create `app/admin/access/actions.ts`.
7. **Tests for actions** — `tests/actions/access-actions.test.ts`.
8. **Gate pages and route handlers** — modify `app/curriculum/[book]/page.tsx`, `app/curriculum/[book]/[slug]/page.tsx`, `app/[slug]/page.tsx`, both `app/api/curriculum/[book]/export/*/route.ts`. Extend the existing PDF/EPUB route tests with the private-book cases.
9. **Update discovery surfaces** — `app/page.tsx`, `app/search/page.tsx`, `app/category/[...slug]/page.tsx`, `app/sitemap.ts`, `searchAll()` in `app/admin/actions.ts`.
10. **Admin UI** — create the five new admin pages in the order listed in §10. Each is a server component.
11. **Update curriculum admin** — add lock icon + "Access" link and "Private" pill to `app/admin/curriculum/page.tsx`.
12. **Manual smoke test**:
    - Create a non-admin user via `/admin/access/users`.
    - Create an org, add the user to it.
    - Mark a book private at `/admin/curriculum/[book]/access`.
    - Log out, hit the book URL → 404.
    - Log in as the non-admin user, hit the URL → still 404 (no grant).
    - As admin, grant the user → URL works as the non-admin.
    - Revoke, grant the org → URL still works.
    - Confirm the book disappears from `/`, `/search`, `/sitemap.xml` for logged-out and non-granted users.
13. **Run `npm run test:run` and `npm run lint`.**

## 15. Potential Pitfalls

- **`params` is a Promise** — every new page must `await params` (already a project convention; do not regress).
- **Slug renaming** — if an article's slug changes via `updateArticle`, any visibility row or grant keyed by the old slug becomes orphaned. Decision: out of scope for this phase; document as a known limitation. A follow-up could update `app/admin/actions.ts` `updateArticle` to rename matching `resource_visibility` and `access_grants` rows when `slug` changes, but that touches an action with existing tests and adds breadth to this plan.
- **`searchAll()` is called from a client component** — it's already a `"use server"` function and can read `getSession()`, so calling it from the command palette stays correct.
- **`getVisibleArticleSlugs` may run on a large set** — for the homepage's "Recently updated" we fetch 24 to filter down to 8; for search the result set is naturally bounded by the search query, so no pagination concerns. For sitemap the article list is potentially large — the function does at most 3 indexed queries (`resource_visibility` lookup, user grants, org grants), all with `inArray` bounded by the input list, so it scales linearly with input size.
- **`onConflictDoNothing` requires Drizzle's `.onConflictDoNothing()` chain method** — available in `drizzle-orm` ≥ 0.30. If the installed version is older, replace with a "select then insert" pre-check (same pattern as `setArticleCategories`). Verify version before relying on it.
- **No FK on `granteeId`** — deleting a user or org must explicitly clean up dangling grants. `deleteOrganization` already does this; if a user-deletion action is added later it must do the same. For this phase users can only be created, not deleted.
- **404 vs notFound() in route handlers** — the page-level gates use `notFound()` (which renders `app/not-found.tsx`). The route handlers must return a plain `NextResponse` with status 404 since they don't have access to the React tree. Both are correct; do not mix them.
- **Internal articles** — `app/curriculum/[book]/[slug]/page.tsx` already checks `article.isInternal && article.parentBookSlug !== bookSlug → notFound()`. The new `canViewBook(bookSlug, …)` gate runs after this and naturally inherits the parent book's visibility.
- **`isInternal` on the homepage's "Recently updated"** — the existing query (`app/page.tsx`) does **not** filter `isInternal`. The task lists this as a fix. Adding `where(eq(articles.isInternal, false))` is mandatory and unrelated to ACL — keep it in the same commit since the discovery-filter pass is touching this query anyway.
- **drizzle-kit journal drift** — because the migration is applied via psql and the journal is patched manually, `npx drizzle-kit generate` later may produce a duplicate "create table" migration. The safe workflow is: keep `0007_access_control.sql` as the authoritative migration, never re-run drizzle-kit generate against this change. If schema changes later require regeneration, manually delete the duplicate from the new generated SQL before applying.
