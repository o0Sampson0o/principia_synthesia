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
  type AnyPgColumn,
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
  emailVerifiedAt: timestamp("email_verified_at"),
  verificationTokenHash: text("verification_token_hash"),
  verificationTokenExpiresAt: timestamp("verification_token_expires_at"),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
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
 * Typed shape for the JSONB `metadata` column on books.
 */
export type BookMetadataShape = {
  status: "draft" | "review" | "published" | "archived";
  tags: string[];
  description: string;
};

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
    summary: text("summary"),
    ownerType: text("owner_type").notNull(), // 'user' | 'org'
    ownerId: integer("owner_id").notNull(),
    metadata: jsonb("metadata")
      .$type<BookMetadataShape>()
      .default({ status: "published", tags: [], description: "" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    deletedAt: timestamp("deleted_at"),
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
    // Unsaved work-in-progress copy. When set, the editor loads this instead of
    // `content`, but visitors always see the published `content`. Cleared the
    // moment the author does a real save (the draft becomes the live version).
    draftContent: text("draft_content"),
    draftSavedAt: timestamp("draft_saved_at"),
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
    lastVerifiedAt: timestamp("last_verified_at").defaultNow(),
    deletedAt: timestamp("deleted_at"),
    forkedFromId: integer("forked_from_id").references((): AnyPgColumn => articles.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique().on(t.ownerType, t.ownerId, t.slug),
    index("articles_owner_idx").on(t.ownerType, t.ownerId),
    index("articles_forked_from_idx").on(t.forkedFromId),
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
  // null = created by root admin / system seed; non-null = created by a regular user
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

/** Many-to-many join between articles and categories. Both sides cascade-delete. */
export const articleCategories = pgTable(
  "article_categories",
  {
    articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.articleId, t.categoryId)]
);

/** Many-to-many join between books and categories. Both sides cascade-delete. */
export const bookCategories = pgTable(
  "book_categories",
  {
    bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.bookId, t.categoryId)]
);

/** User-bookmarked categories — appear by default in the category picker. */
export const categoryBookmarks = pgTable(
  "category_bookmarks",
  {
    userId:     integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    createdAt:  timestamp("created_at").defaultNow(),
  },
  (t) => [unique().on(t.userId, t.categoryId)]
);

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
    // NULL articleId marks a part divider: a standalone, reorderable "Part"
    // heading row whose title lives in partTitle. Chapter rows have an
    // articleId and (post-migration 0020) a NULL partTitle.
    articleId: integer("article_id").references(() => articles.id, { onDelete: "cascade" }),
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
 * The 16 color tokens that make up one side (light or dark) of the site theme.
 */
export type ThemeTokens = {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  accent: string;
  accentForeground: string;
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
 *
 * Feature 4 adds referrer, referrerSource, and sessionId columns.
 * Legacy rows keep NULLs for those columns.
 */
export const articleViews = pgTable(
  "article_views",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at").defaultNow().notNull(),
    referrer: text("referrer"),              // raw Referer header, max 2000 chars
    referrerSource: text("referrer_source"), // 'direct' | 'search' | 'social' | 'internal' | 'external'
    sessionId: text("session_id"),           // 32-hex-char anonymous token, NULL for legacy rows
  },
  (t) => [
    index("article_views_article_viewed_idx").on(t.articleId, t.viewedAt),
    index("article_views_article_session_idx").on(t.articleId, t.sessionId),
  ]
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
    recurrenceRule: text("recurrence_rule"),
    recurrenceUntil: timestamp("recurrence_until"),
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

// ---------------------------------------------------------------------------
// Org invitations
// ---------------------------------------------------------------------------

/**
 * Pending invitations for a user to join an org by email.
 * Unique on (orgId, email) so only one pending invite per email per org.
 * Token is stored as SHA-256 hash only.
 */
export const orgInvitations = pgTable(
  "org_invitations",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(), // 'admin' | 'member'
    tokenHash: text("token_hash").notNull(),
    invitedBy: integer("invited_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [unique().on(t.orgId, t.email)]
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

// ---------------------------------------------------------------------------
// Article snapshots (publish-time immutable freeze; NOT the same as revisions)
// ---------------------------------------------------------------------------

/**
 * Immutable publish-time snapshots of articles.
 * Created when an article is saved with status === "published".
 * Publicly addressable via /:publisher/articles/:slug?v=<shortHash>.
 * Cascade-deletes with the parent article.
 */
export const articleSnapshots = pgTable(
  "article_snapshots",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(), // full SHA-256 hex
    shortHash: text("short_hash").notNull(),      // first 7 chars (denormalised)
    title: text("title").notNull(),
    summary: text("summary"),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<ArticleMetadataShape>().notNull(),
    publishedAt: timestamp("published_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.articleId, t.contentHash),
    index("article_snapshots_article_idx").on(t.articleId),
    index("article_snapshots_short_hash_idx").on(t.articleId, t.shortHash),
  ]
);

// ---------------------------------------------------------------------------
// Notifications (in-app notification system)
// ---------------------------------------------------------------------------

/**
 * In-app notifications for users. `type` is a free-text discriminant
 * ('stale_article' | 'article_forked' | 'article_cited') to avoid
 * migrations when adding new notification types.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("notifications_user_unread_idx").on(t.userId, t.readAt),
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
  ]
);

// ---------------------------------------------------------------------------
// Article comments (threaded, with soft-delete)
// ---------------------------------------------------------------------------

/**
 * Top-level comments and threaded replies on articles.
 * `parentId` is null for root comments; replies point to their parent.
 * Soft-deletes via `deletedAt` preserve thread structure: deleted rows are
 * displayed as "Comment removed" rather than breaking reply chains.
 */
export const articleComments = pgTable(
  "article_comments",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    authorId: integer("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references((): AnyPgColumn => articleComments.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("article_comments_article_idx").on(t.articleId),
    index("article_comments_author_idx").on(t.authorId),
    index("article_comments_parent_idx").on(t.parentId),
  ]
);

// ---------------------------------------------------------------------------
// Article citations (internal cross-article citation tracking)
// ---------------------------------------------------------------------------

/**
 * Tracks <Cite slug="publisher/article-slug" /> references between articles.
 * Rows are recomputed on every save — the old set is replaced atomically.
 * Unique on (citingArticleId, citedArticleId) to deduplicate multiple <Cite>
 * calls to the same target in one article.
 */
export const articleCitations = pgTable(
  "article_citations",
  {
    id: serial("id").primaryKey(),
    citingArticleId: integer("citing_article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    citedArticleId: integer("cited_article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(), // 0-based order within the citing article
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.citingArticleId, t.citedArticleId),
    index("article_citations_citing_idx").on(t.citingArticleId),
    index("article_citations_cited_idx").on(t.citedArticleId),
  ]
);

// ---------------------------------------------------------------------------
// API tokens (personal access tokens for the sync REST API)
// ---------------------------------------------------------------------------

/**
 * Per-user bearer tokens for /api/v1 (the external sync API used by ps-sync).
 * Only the sha256 hash of the raw token is stored; `prefix` keeps the first
 * characters of the raw token so users can recognise tokens in the settings
 * UI. Revocation is soft (`revokedAt`) so the row remains as an audit record.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").unique().notNull(),
    prefix: text("prefix").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"), // null = never expires
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)]
);
