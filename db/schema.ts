import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  unique,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Publishers — global slug registry for both users and orgs
// ---------------------------------------------------------------------------

/**
 * Enforces globally-unique publisher slugs across users and orgs.
 * Exactly one of `userId` or `orgId` is non-null (enforced by CHECK).
 * Cascade-deletes when the owning user or org is deleted.
 */
export const publishers = pgTable(
  "publishers",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").unique().notNull(),
    kind: text("kind").notNull(), // 'user' | 'org'
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    orgId: integer("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    unique().on(t.kind, t.userId),
    unique().on(t.kind, t.orgId),
  ]
);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * User accounts. `isRootAdmin` replaces the old binary `isAdmin` flag.
 * `publisherSlug` is denormalised here (not a FK) to avoid circular dependency;
 * the canonical slug lives in `publishers`.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  isRootAdmin: boolean("is_root_admin").default(false).notNull(),
  displayName: text("display_name").notNull().default(""),
  publisherSlug: text("publisher_slug").unique().notNull().default(""),
});

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

/**
 * Named groups of users. `creatorId` records the user who created the org;
 * they are automatically added as `super_admin`. `publisherSlug` is
 * denormalised for the same reason as on `users`.
 */
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  creatorId: integer("creator_id").references(() => users.id, { onDelete: "set null" }),
  publisherSlug: text("publisher_slug").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Junction table linking users to organizations.
 * `role` is `'super_admin' | 'admin' | 'member'`.
 * Both sides cascade-delete. Unique on (orgId, userId).
 */
export const orgMemberships = pgTable(
  "org_memberships",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'super_admin' | 'admin' | 'member'
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (t) => [unique().on(t.orgId, t.userId)]
);

// ---------------------------------------------------------------------------
// Books (curriculum collections)
// ---------------------------------------------------------------------------

/**
 * A book is an ordered collection of articles (curriculum).
 * Slugs are unique only within a publisher (ownerType + ownerId).
 * The old implicit book model (shared bookSlug on curriculumEntries) is replaced
 * by this explicit table.
 */
export const books = pgTable(
  "books",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    ownerType: text("owner_type").notNull(), // 'user' | 'org'
    ownerId: integer("owner_id").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique().on(t.ownerType, t.ownerId, t.slug),
    index("books_owner_idx").on(t.ownerType, t.ownerId),
  ]
);

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

/**
 * Typed shape for the JSONB `metadata` column on articles.
 * Populated by parsing the YAML frontmatter block at the top of `content`.
 */
export type ArticleMetadataShape = {
  status: "draft" | "review" | "published" | "archived";
  tags: string[];
  description: string;
  canvas: string | null;
};

/**
 * The primary content table. `content` is raw MDX stored as a string.
 *
 * Slugs are unique only within a publisher (ownerType + ownerId).
 * `isInternal` marks articles that only exist inside a specific book.
 * `parentBookId` FK → books.id (replaces old parentBookSlug text column).
 */
export const articles = pgTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    summary: text("summary"),
    ownerType: text("owner_type").notNull(), // 'user' | 'org'
    ownerId: integer("owner_id").notNull(),
    isInternal: boolean("is_internal").default(false).notNull(),
    parentBookId: integer("parent_book_id").references(() => books.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata")
      .$type<ArticleMetadataShape>()
      .default({ status: "published", tags: [], description: "", canvas: null })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique().on(t.ownerType, t.ownerId, t.slug),
    index("articles_owner_idx").on(t.ownerType, t.ownerId),
  ]
);

// ---------------------------------------------------------------------------
// Categories (global taxonomy, unchanged)
// ---------------------------------------------------------------------------

/**
 * Flat category taxonomy. Categories are auto-created on save.
 * They remain global (not per-publisher) and link out to publisher-scoped URLs.
 */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
});

/** Many-to-many join between articles and categories. Both sides cascade-delete. */
export const articleCategories = pgTable("article_categories", {
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
});

// ---------------------------------------------------------------------------
// Revisions (unchanged structure, FK still → articles)
// ---------------------------------------------------------------------------

/**
 * Revision history for articles. A new row is inserted before every save.
 * Cascade-deletes when the parent article is deleted.
 */
export const revisions = pgTable("revisions", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  content: text("content"),
  editNote: text("edit_note"),
  editedAt: timestamp("edited_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// Curriculum entries
// ---------------------------------------------------------------------------

/**
 * Ordered entries in a book. `bookId` FK replaces the old `bookSlug`/`bookTitle`
 * denormalised text columns. Cascade-deletes when the book is deleted.
 */
export const curriculumEntries = pgTable(
  "curriculum_entries",
  {
    id: serial("id").primaryKey(),
    bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
    articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    partTitle: text("part_title"),
  },
  (t) => [unique().on(t.bookId, t.articleId)]
);

// ---------------------------------------------------------------------------
// KAO Objects (plugin system removed; source/pluginMeta columns dropped)
// ---------------------------------------------------------------------------

/**
 * Knowledge as an Object (KAO) primitive.
 * `type` discriminates the content shape:
 *   - "animation": { code: string }
 *   - "dataset":   { headers: string[]; rows: unknown[][] }
 *   - "diagram":   { format: "mermaid" | "graphviz"; source: string }
 *
 * Slugs are unique only within a publisher (ownerType + ownerId).
 * The old plugin columns (`source`, `pluginMeta`) are not present in this schema.
 */
export const objects = pgTable(
  "objects",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(), // 'animation' | 'dataset' | 'diagram'
    content: jsonb("content").notNull(),
    description: text("description"),
    ownerType: text("owner_type").notNull(), // 'user' | 'org'
    ownerId: integer("owner_id").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique().on(t.ownerType, t.ownerId, t.slug),
    index("objects_owner_idx").on(t.ownerType, t.ownerId),
  ]
);

// ---------------------------------------------------------------------------
// Themes (unchanged)
// ---------------------------------------------------------------------------

/**
 * The 15 color tokens that make up one side (light or dark) of the site theme.
 */
export type ThemeTokens = {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  link: string;
  linkHover: string;
  codeBackground: string;
  surface: string;
  surfaceHover: string;
  primaryBtn: string;
  primaryBtnText: string;
  inputBorder: string;
  inputFocusBorder: string;
  secondaryText: string;
};

/**
 * One row per user. Stores light + dark theme token overrides and
 * the user's color-scheme preference cookie value.
 */
export const userThemes = pgTable("user_themes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  lightTokens: jsonb("light_tokens").$type<ThemeTokens>().notNull(),
  darkTokens: jsonb("dark_tokens").$type<ThemeTokens>().notNull(),
  colorSchemePreference: text("color_scheme_preference").default("system").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// Book snapshots
// ---------------------------------------------------------------------------

/**
 * Point-in-time snapshots of a book's curriculum structure.
 * `bookId` FK replaces the old `bookSlug`/`bookTitle` columns.
 * Cascade-deletes when the book is deleted.
 */
export const bookSnapshots = pgTable("book_snapshots", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** One row per curriculum entry captured inside a `bookSnapshot`. */
export const bookSnapshotEntries = pgTable("book_snapshot_entries", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id")
    .notNull()
    .references(() => bookSnapshots.id, { onDelete: "cascade" }),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  articleSlug: text("article_slug").notNull(),
  articleTitle: text("article_title").notNull(),
  articleContent: text("article_content"),
  position: integer("position").notNull(),
  partTitle: text("part_title"),
});

// ---------------------------------------------------------------------------
// PDF cache
// ---------------------------------------------------------------------------

/**
 * Cached PDF exports. `bookId` FK replaces the old `bookSlug` text column.
 * At most one cached PDF per book (old entries replaced on regeneration).
 */
export const pdfCaches = pgTable("pdf_caches", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  pdfData: text("pdf_data").notNull(),
  contentHash: text("content_hash").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// Visibility + grants (three-state visibility model)
// ---------------------------------------------------------------------------

/**
 * Per-resource visibility setting. Absent row means `'public'` (the default).
 * `visibility` is `'public' | 'org' | 'private'`.
 * `ownerType`/`ownerId` scope the row to the resource's publisher.
 * `resourceKey` is the slug of the resource.
 */
export const resourceVisibility = pgTable(
  "resource_visibility",
  {
    id: serial("id").primaryKey(),
    resourceType: text("resource_type").notNull(), // 'book' | 'article' | 'object'
    ownerType: text("owner_type").notNull(),         // 'user' | 'org'
    ownerId: integer("owner_id").notNull(),
    resourceKey: text("resource_key").notNull(),     // slug
    visibility: text("visibility").default("public").notNull(), // 'public' | 'org' | 'private'
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique().on(t.resourceType, t.ownerType, t.ownerId, t.resourceKey)]
);

/**
 * Grants viewing access to a private resource.
 * `granteeType` is `"user"` or `"org"`.
 * `ownerType`/`ownerId` scope the grant to the resource's publisher.
 */
export const accessGrants = pgTable(
  "access_grants",
  {
    id: serial("id").primaryKey(),
    resourceType: text("resource_type").notNull(),
    ownerType: text("owner_type").notNull(),
    ownerId: integer("owner_id").notNull(),
    resourceKey: text("resource_key").notNull(),
    granteeType: text("grantee_type").notNull(), // 'user' | 'org'
    granteeId: integer("grantee_id").notNull(),
    grantedAt: timestamp("granted_at").defaultNow(),
    grantedBy: integer("granted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    unique().on(t.resourceType, t.ownerType, t.ownerId, t.resourceKey, t.granteeType, t.granteeId),
  ]
);

// ---------------------------------------------------------------------------
// Article views (homepage top-5 by 30-day views)
// ---------------------------------------------------------------------------

/**
 * One row per article page render. No PII stored — just article + timestamp.
 * Indexed on (articleId, viewedAt) for the monthly aggregation query.
 */
export const articleViews = pgTable(
  "article_views",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  },
  (t) => [index("article_views_article_viewed_idx").on(t.articleId, t.viewedAt)]
);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Publisher-scoped events (conferences, lectures, releases, etc.).
 * Visibility is managed via the `resourceVisibility` table (absent = public).
 * Slugs are unique per publisher (ownerType + ownerId).
 */
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    eventDate: timestamp("event_date").notNull(),
    category: text("category"),
    isEraStart: boolean("is_era_start").default(false).notNull(),
    isEraEnd: boolean("is_era_end").default(false).notNull(),
    eraName: text("era_name"),
    ownerType: text("owner_type").notNull(),
    ownerId: integer("owner_id").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique().on(t.ownerType, t.ownerId, t.slug),
    index("events_owner_idx").on(t.ownerType, t.ownerId),
    index("events_event_date_idx").on(t.eventDate),
    index("events_category_idx").on(t.category),
  ]
);

/**
 * Many-to-many join between events and articles.
 * Both sides cascade-delete.
 */
export const eventArticles = pgTable(
  "event_articles",
  {
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.eventId, t.articleId)]
);
