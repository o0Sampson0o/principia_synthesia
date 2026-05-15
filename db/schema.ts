import { pgTable, serial, text, timestamp, integer, boolean, unique, jsonb } from "drizzle-orm/pg-core";

/** Admin accounts. Only users with `isAdmin = true` can access `/admin/**`. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
});

/**
 * The primary content table. `content` is raw MDX stored as a string.
 *
 * `isInternal` marks articles that only exist inside a specific book — they
 * are not discoverable via direct URL, search, or category listings.
 * `parentBookSlug` records which book owns the internal article and is used
 * to enforce access control and to clean up on curriculum entry removal.
 */
export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  title: text("title").notNull(),
  content: text("content"),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isInternal: boolean("is_internal").default(false).notNull(),
  parentBookSlug: text("parent_book_slug"),
});

/**
 * Flat category taxonomy. `parentId` allows hierarchical nesting but the UI
 * currently treats all categories as top-level. Categories are auto-created
 * by `setArticleCategories()` when an unknown slug is saved with an article.
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

/**
 * Revision history for articles. A new row is inserted before every save and
 * before every revision restore, so the history is always complete. Rows are
 * cascade-deleted when the parent article is deleted.
 */
export const revisions = pgTable("revisions", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  content: text("content"),
  editNote: text("edit_note"),
  editedAt: timestamp("edited_at").defaultNow(),
});

/**
 * Ordered reading lists ("books") for the curriculum feature.
 *
 * There is no dedicated `books` table — a book is implicitly defined by a
 * shared `bookSlug` across one or more rows in this table. The `bookTitle` is
 * denormalized onto every entry (all entries for a book should have the same
 * title). Deleting all entries for a given `bookSlug` effectively deletes the book.
 *
 * `position` controls the reading order within a book (ascending, 0-based).
 * `partTitle` is an optional section heading rendered above the entry in the
 * book's table of contents, allowing articles to be grouped into named parts.
 *
 * A unique constraint prevents the same article from appearing twice in one book.
 */
export const curriculumEntries = pgTable(
  "curriculum_entries",
  {
    id: serial("id").primaryKey(),
    bookSlug: text("book_slug").notNull(),
    bookTitle: text("book_title").notNull(),
    articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(), // ordering within the book
    partTitle: text("part_title"),           // optional section heading above this entry
  },
  (t) => [unique().on(t.bookSlug, t.articleId)]
);

/**
 * Canvas-based physics animations created and managed via the admin panel.
 * `code` stores the raw JavaScript that is injected into a sandboxed `<iframe>`
 * by `GET /api/animations/[slug]`. See `docs/animations.md` for authoring details.
 *
 * `source` is `"plugin"` for animations installed from the plugin registry and
 * `null` for user-created animations. `pluginMeta` stores a snapshot of the
 * manifest metadata (name, version, description, etc.) for display in the gallery.
 */
export const savedAnimations = pgTable("saved_animations", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  source: text("source"),
  pluginMeta: jsonb("plugin_meta"),
});

/**
 * Knowledge as an Object (KAO) primitive. Each row represents a typed knowledge
 * object with a slug, a human-readable name, a type discriminator, and a JSONB
 * `content` payload whose shape is governed by the type:
 *   - "animation": { code: string }
 *   - "dataset":   { headers: string[]; rows: unknown[][] }
 *   - "diagram":   { format: "mermaid" | "graphviz"; source: string }
 *
 * Objects are embedded in articles via [[object:slug]] wikilinks and rendered
 * via /api/objects/[slug]/preview for animation types.
 */
export const objects = pgTable("objects", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),          // "animation" | "dataset" | "diagram"
  content: jsonb("content").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Provenance for objects installed from the on-disk plugin registry.
  // For animation-type objects scanned from `plugins/animations/`, `source` is
  // `"plugin"` and `pluginMeta` is the manifest snapshot. NULL for all others.
  source: text("source"),
  pluginMeta: jsonb("plugin_meta"),
});

/**
 * The 15 color tokens that make up one side (light or dark) of the site theme.
 * All values are CSS color strings (hex, rgb, hsl, etc.). Each token maps to a
 * CSS custom property — e.g. `primaryBtn` → `--primary-btn`. See `lib/theme.ts`
 * for the full token-to-CSS-var mapping and `docs/theming.md` for usage guidance.
 */
export type ThemeTokens = {
  background: string
  foreground: string
  muted: string
  mutedForeground: string
  border: string
  link: string
  linkHover: string
  codeBackground: string
  // Extended tokens
  surface: string         // card/nav/raised surface bg
  surfaceHover: string    // hovered surface
  primaryBtn: string      // primary button bg
  primaryBtnText: string  // primary button text
  inputBorder: string     // form input borders
  inputFocusBorder: string // focused input border
  secondaryText: string   // labels, section headers
}

/**
 * Point-in-time snapshots of a book's curriculum structure.
 * Each snapshot captures the ordered list of entries at the moment it was taken.
 * Rows in `bookSnapshotEntries` cascade-delete when the snapshot is deleted.
 */
export const bookSnapshots = pgTable("book_snapshots", {
  id: serial("id").primaryKey(),
  bookSlug: text("book_slug").notNull(),
  bookTitle: text("book_title").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** One row per curriculum entry captured inside a `bookSnapshot`. */
export const bookSnapshotEntries = pgTable("book_snapshot_entries", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id").notNull().references(() => bookSnapshots.id, { onDelete: "cascade" }),
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  articleSlug: text("article_slug").notNull(),
  articleTitle: text("article_title").notNull(),
  articleContent: text("article_content"),
  position: integer("position").notNull(),
  partTitle: text("part_title"),
});

/**
 * Stores a user's custom color theme. One row per user (enforced by the unique
 * constraint on `userId`). Light and dark tokens are persisted as JSONB and
 * merged with the defaults at render time by the root layout.
 */
export const userThemes = pgTable("user_themes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  lightTokens: jsonb("light_tokens").$type<ThemeTokens>().notNull(),
  darkTokens: jsonb("dark_tokens").$type<ThemeTokens>().notNull(),
  colorSchemePreference: text("color_scheme_preference").default("system").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Cached PDF exports for curriculum books. The `contentHash` is a SHA-256
 * digest of the book's current state (title + all entry positions, part titles,
 * article titles, and article content). When any article or curriculum entry
 * changes the hash won't match, triggering a fresh PDF generation. Old entries
 * for the same `bookSlug` are deleted before inserting a new one, so there is
 * at most one cached PDF per book at any time.
 */
export const pdfCaches = pgTable("pdf_caches", {
  id: serial("id").primaryKey(),
  bookSlug: text("book_slug").notNull(),
  pdfData: text("pdf_data").notNull(),
  contentHash: text("content_hash").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
});

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
