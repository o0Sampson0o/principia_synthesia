import { z } from "zod";

// ---------------------------------------------------------------------------
// Publisher and content slug schemas
// ---------------------------------------------------------------------------

const RESERVED_SLUGS = [
  "login",
  "signup",
  "search",
  "organizations",
  "settings",
  "category",
  "pricing",
  "api",
  "events",
  "timeline",
];

/** Publisher slug: 3–40 chars, lowercase, hyphens allowed, not a reserved word. */
export const publisherSlugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(40, "Slug must be at most 40 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only")
  .refine((s) => !RESERVED_SLUGS.includes(s), "That slug is reserved");

/** Article slug: must start with `article-` */
export const articleSlugSchema = z
  .string()
  .regex(/^article-[a-z0-9]+(?:-[a-z0-9]+)*$/, "Article slug must start with 'article-'");

/** Book slug: must start with `book-` */
export const bookSlugSchema = z
  .string()
  .regex(/^book-[a-z0-9]+(?:-[a-z0-9]+)*$/, "Book slug must start with 'book-'");

/** Animation object slug: must start with `anim-` */
export const animSlugSchema = z
  .string()
  .regex(/^anim-[a-z0-9]+(?:-[a-z0-9]+)*$/, "Animation slug must start with 'anim-'");

/** Non-animation object slug: must start with `object-` */
export const objectSlugSchema = z
  .string()
  .regex(/^object-[a-z0-9]+(?:-[a-z0-9]+)*$/, "Object slug must start with 'object-'");

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

/** Validates the login form fields. */
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/** Validates the self-service signup form. */
export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1, "Display name is required").max(100, "Display name too long"),
  publisherSlug: publisherSlugSchema,
});

// ---------------------------------------------------------------------------
// Article schemas
// ---------------------------------------------------------------------------

/**
 * Validates form data for creating a new article.
 * `categories` is a comma-separated string of slugs (e.g. `"physics,math"`).
 */
export const createArticleSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  slug: articleSlugSchema,
  summary: z.string().max(500, "Summary too long").optional(),
  content: z.string().optional(),
  categories: z.string().optional(),
});

/**
 * Validates form data for updating an existing article.
 * Extends `createArticleSchema` with the required database `id`.
 */
export const updateArticleSchema = createArticleSchema.extend({
  id: z.coerce.number().int().positive("Invalid article ID"),
});

/**
 * Validates form data for deleting an article.
 */
export const deleteArticleSchema = z.object({
  id: z.coerce.number().int().positive("Invalid article ID"),
  slug: z.string().min(1),
});

/**
 * Validates form data for restoring an article to a previous revision.
 */
export const restoreRevisionSchema = z.object({
  revisionId: z.coerce.number().int().positive("Invalid revision ID"),
  articleId: z.coerce.number().int().positive("Invalid article ID"),
  publisherSlug: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Book schemas
// ---------------------------------------------------------------------------

/** Validates form data for creating a book. */
export const createBookSchema = z.object({
  slug: bookSlugSchema,
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  summary: z.string().max(500, "Summary too long").optional(),
  ownerType: z.enum(["user", "org"]),
  ownerId: z.coerce.number().int().positive("Invalid owner ID"),
});

/** Validates form data for deleting a book. */
export const deleteBookSchema = z.object({
  bookId: z.coerce.number().int().positive("Invalid book ID"),
});

/** Validates form data for updating a book's title and slug. */
export const updateBookSchema = z.object({
  id: z.coerce.number().int().positive("Invalid book ID"),
  slug: bookSlugSchema,
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  summary: z.string().max(500, "Summary too long").optional(),
  categories: z.string().optional(),
  /**
   * KaTeX macro definitions shared by the book's internal sections. Bounded
   * because it is expanded by the math renderer on every page of the book;
   * `lib/katex-macros.ts` caps what it feeds KaTeX as a second line.
   */
  macros: z.string().max(8000, "Macro definitions too long").optional(),
});

/**
 * Validates form data for adding or updating a curriculum (book) entry.
 * Uses `bookId` FK instead of the old `bookSlug`/`bookTitle` denormalised pair.
 */
export const upsertCurriculumEntrySchema = z.object({
  bookId: z.coerce.number().int().positive("Invalid book ID"),
  articleId: z.coerce.number().int().positive("Invalid article ID"),
  position: z.coerce.number().int().min(0, "Position must be non-negative"),
});

/**
 * Validates form data for removing a single article from a curriculum book.
 */
export const removeCurriculumEntrySchema = z.object({
  id: z.coerce.number().int().positive("Invalid entry ID"),
  bookId: z.coerce.number().int().positive("Invalid book ID"),
});

/**
 * Validates form data for creating an internal (book-only) article.
 * The article is automatically linked to the given book as a curriculum entry.
 */
export const createInternalArticleSchema = z.object({
  bookId: z.coerce.number().int().positive("Invalid book ID"),
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  slug: articleSlugSchema,
  position: z.coerce.number().int().min(0, "Position must be non-negative"),
});

/**
 * Validates form data for adding an article authored by ANOTHER publisher
 * to one of the current publisher's books. The article's own visibility
 * (resolved against the current session) is checked in the server action,
 * not here.
 */
export const addExternalArticleSchema = z.object({
  bookId: z.coerce.number().int().positive("Invalid book ID"),
  targetPublisher: publisherSlugSchema,
  articleSlug: articleSlugSchema,
  position: z.coerce.number().int().min(0, "Position must be non-negative"),
});

/**
 * Part dividers: standalone "Part" heading rows in a book's curriculum
 * (curriculum entries with a NULL articleId).
 */
export const addPartSchema = z.object({
  bookId: z.coerce.number().int().positive("Invalid book ID"),
  title: z.string().min(1, "Part title is required").max(200, "Part title too long"),
  position: z.coerce.number().int().min(0, "Position must be non-negative"),
});

export const renamePartSchema = z.object({
  entryId: z.coerce.number().int().positive("Invalid entry ID"),
  bookId: z.coerce.number().int().positive("Invalid book ID"),
  title: z.string().min(1, "Part title is required").max(200, "Part title too long"),
});

/**
 * Chapter dividers: standalone "Chapter" heading rows (the middle grouping
 * level between Part and Section) in a book's curriculum. Same shape as Part
 * dividers, distinguished by `dividerLevel: 'chapter'` on insert.
 */
export const addChapterDividerSchema = z.object({
  bookId: z.coerce.number().int().positive("Invalid book ID"),
  title: z.string().min(1, "Chapter title is required").max(200, "Chapter title too long"),
  position: z.coerce.number().int().min(0, "Position must be non-negative"),
});

export const renameChapterDividerSchema = z.object({
  entryId: z.coerce.number().int().positive("Invalid entry ID"),
  bookId: z.coerce.number().int().positive("Invalid book ID"),
  title: z.string().min(1, "Chapter title is required").max(200, "Chapter title too long"),
});

/**
 * Validates form data for promoting an internal (book-only) article into a
 * standalone article. The article keeps its curriculum entry; only its
 * `isInternal`/`parentBookId` flags flip.
 */
export const promoteArticleSchema = z.object({
  articleId: z.coerce.number().int().positive("Invalid article ID"),
});

/**
 * Validates form data for absorbing a standalone article into a book, making
 * it an internal (book-only) article owned by that book. Only allowed when the
 * article is a chapter in exactly one book (the target) owned by the same
 * publisher — enforced in the server action.
 */
export const absorbArticleSchema = z.object({
  articleId: z.coerce.number().int().positive("Invalid article ID"),
  bookId: z.coerce.number().int().positive("Invalid book ID"),
});

// ---------------------------------------------------------------------------
// Visibility + access grant schemas
// ---------------------------------------------------------------------------

export const setVisibilitySchema = z.object({
  resourceType: z.enum(["book", "article", "object", "event"]),
  ownerType: z.enum(["user", "org"]),
  ownerId: z.coerce.number().int().positive("Invalid owner ID"),
  resourceKey: z.string().min(1, "Resource key is required"),
  visibility: z.enum(["public", "org", "private"]),
});

export const addAccessGrantSchema = z.object({
  resourceType: z.enum(["book", "article", "object", "event"]),
  ownerType: z.enum(["user", "org"]),
  ownerId: z.coerce.number().int().positive("Invalid owner ID"),
  resourceKey: z.string().min(1, "Resource key is required"),
  granteeType: z.enum(["user", "org"]),
  granteeId: z.coerce.number().int().positive("Invalid grantee ID"),
});

export const removeAccessGrantSchema = z.object({
  grantId: z.coerce.number().int().positive("Invalid grant ID"),
});

// ---------------------------------------------------------------------------
// Organization schemas
// ---------------------------------------------------------------------------

export const createOrganizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  publisherSlug: publisherSlugSchema,
});

export const deleteOrganizationSchema = z.object({
  orgId: z.coerce.number().int().positive("Invalid org ID"),
});

export const addOrgMemberSchema = z.object({
  orgId: z.coerce.number().int().positive("Invalid org ID"),
  userId: z.coerce.number().int().positive("Invalid user ID"),
  role: z.enum(["super_admin", "admin", "member"]),
});

export const removeOrgMemberSchema = z.object({
  membershipId: z.coerce.number().int().positive("Invalid membership ID"),
});

export const updateOrgMemberRoleSchema = z.object({
  membershipId: z.coerce.number().int().positive("Invalid membership ID"),
  role: z.enum(["super_admin", "admin", "member"]),
});

export const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1, "Display name is required").max(100, "Display name too long"),
  publisherSlug: publisherSlugSchema,
});

// ---------------------------------------------------------------------------
// KAO Object schemas
// ---------------------------------------------------------------------------

/**
 * KAO slug: animation slugs start with `anim-`, all others with `object-`.
 * Validated via superRefine so the type field is visible.
 */
export const createKaoSchema = z
  .object({
    slug: z.string().min(1, "Slug is required"),
    name: z.string().min(1, "Name is required").max(200),
    type: z.enum(["animation", "dataset", "diagram"]),
    content: z.string().min(2, "Content is required"), // raw JSON string, parsed in action
    description: z.string().max(1000).optional(),
    ownerType: z.enum(["user", "org"]),
    ownerId: z.coerce.number().int().positive("Invalid owner ID"),
  })
  .superRefine((data, ctx) => {
    if (data.type === "animation") {
      const result = animSlugSchema.safeParse(data.slug);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Animation slug must start with 'anim-'",
          path: ["slug"],
        });
      }
    } else {
      const result = objectSlugSchema.safeParse(data.slug);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Object slug must start with 'object-'",
          path: ["slug"],
        });
      }
    }
  });

export const updateKaoSchema = createKaoSchema.extend({
  id: z.coerce.number().int().positive(),
});

export const deleteKaoSchema = z.object({
  id: z.coerce.number().int().positive(),
  slug: z.string().min(1),
});

export const createDiagramSchema = z.object({
  slug: objectSlugSchema,
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(1000).optional(),
  format: z.enum(["mermaid", "graphviz"]),
  source: z.string().min(1, "Source is required").max(50_000),
  ownerType: z.enum(["user", "org"]),
  ownerId: z.coerce.number().int().positive("Invalid owner ID"),
});

export const updateDiagramSchema = createDiagramSchema.extend({
  id: z.coerce.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Event schemas
// ---------------------------------------------------------------------------

/** Event slug: must start with `event-` but NOT with the reserved `event-era-` prefix. */
export const eventSlugSchema = z
  .string()
  .regex(/^event-[a-z0-9]+(?:-[a-z0-9]+)*$/, "Event slug must start with 'event-'")
  .refine((s) => !s.startsWith("event-era-"), "Event slug must not start with 'event-era-' (reserved for era markers)");

/** Recurrence frequency for events. */
export const recurrenceFrequencySchema = z.enum(["none", "weekly", "monthly", "annually"]).default("none");

/** Validates form data for creating a new event. */
export const createEventSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200, "Title too long"),
    slug: eventSlugSchema,
    description: z.string().max(5000, "Description too long").optional(),
    eventDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date"),
    category: z.string().max(100, "Category too long").optional(),
    relatedArticleSlugs: z.string().optional(),
    isEraStart: z.string().optional().transform((v) => v === "on"),
    isEraEnd: z.string().optional().transform((v) => v === "on"),
    eraName: z.string().max(100, "Era name too long").optional(),
    recurrenceFrequency: recurrenceFrequencySchema.optional(),
    recurrenceCount: z.coerce.number().int().min(1).max(100).optional(),
    recurrenceUntil: z
      .string()
      .optional()
      .refine((s) => !s || !Number.isNaN(Date.parse(s)), "Invalid recurrence end date"),
  })
  .superRefine((data, ctx) => {
    if (data.isEraStart && !data.eraName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Era name is required when marking as era start",
        path: ["eraName"],
      });
    }
    if (data.isEraEnd && !data.eraName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Era name is required when marking as era end",
        path: ["eraName"],
      });
    }
    const freq = data.recurrenceFrequency ?? "none";
    if (freq !== "none" && (data.isEraStart || data.isEraEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Era marker events cannot recur",
        path: ["recurrenceFrequency"],
      });
    }
  });

/** Validates form data for updating an existing event. */
export const updateEventSchema = createEventSchema.extend({
  id: z.coerce.number().int().positive("Invalid event ID"),
});

/** Validates form data for deleting an event. */
export const deleteEventSchema = z.object({
  id: z.coerce.number().int().positive("Invalid event ID"),
  slug: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Era schemas
// ---------------------------------------------------------------------------

/** Validates form data for creating a new era (paired start + optional end events). */
export const createEraSchema = z
  .object({
    name: z.string().min(1, "Era name is required").max(100, "Era name too long").trim(),
    startDate: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)), "Start date is required"),
    endDate: z
      .string()
      .optional()
      .refine((s) => !s || !Number.isNaN(Date.parse(s)), "Invalid end date"),
    description: z.string().max(5000, "Description too long").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.endDate && !Number.isNaN(Date.parse(data.endDate))) {
      if (new Date(data.endDate) < new Date(data.startDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End date must be after start date",
          path: ["endDate"],
        });
      }
    }
  });

/** Validates form data for renaming an era (updates eraName on all matching events). */
export const renameEraSchema = z.object({
  currentName: z.string().min(1, "Current era name is required"),
  newName: z.string().min(1, "New era name is required").max(100, "Name too long").trim(),
});

/** Validates form data for updating an era's start/end dates. */
export const updateEraSchema = z
  .object({
    eraName: z.string().min(1, "Era name is required"),
    startEventId: z.coerce.number().int().positive("Invalid start event ID"),
    startDate: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)), "Start date is required"),
    endEventId: z.coerce.number().int().positive().optional(),
    endDate: z
      .string()
      .optional()
      .refine((s) => !s || !Number.isNaN(Date.parse(s)), "Invalid end date"),
  })
  .superRefine((data, ctx) => {
    if (data.endDate && !Number.isNaN(Date.parse(data.endDate))) {
      if (new Date(data.endDate) < new Date(data.startDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End date must be after start date",
          path: ["endDate"],
        });
      }
    }
  });

/** Validates form data for deleting an era (deletes only the marker events). */
export const deleteEraSchema = z.object({
  eraName: z.string().min(1, "Era name is required"),
  startEventId: z.coerce.number().int().positive("Invalid start event ID"),
  endEventId: z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// Org invitation schemas
// ---------------------------------------------------------------------------

export const inviteMemberSchema = z.object({
  orgId: z.coerce.number().int().positive("Invalid org ID"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member"]),
});

export const cancelInvitationSchema = z.object({
  invitationId: z.coerce.number().int().positive("Invalid invitation ID"),
});

// ---------------------------------------------------------------------------
// Bulk event import schemas
// ---------------------------------------------------------------------------

export const bulkImportSourceSchema = z.object({
  format: z.enum(["csv", "json", "wikidata"]),
  sparqlQuery: z.string().max(10_000).optional(),
});

// ---------------------------------------------------------------------------
// Sync bundle schemas (retained; plugin manifest schemas removed)
// ---------------------------------------------------------------------------

/**
 * Schema for a single section entry inside the sync bundle's book.json.
 * `updatedAt` is an ISO 8601 string (validated by Date.parse, not z.date()).
 */
export const syncBundleSectionSchema = z.object({
  slug: articleSlugSchema,
  title: z.string().min(1).max(200),
  partTitle: z.string().max(200).nullable().optional(),
  chapterTitle: z.string().max(200).nullable().optional(),
  position: z.number().int().min(0),
  isInternal: z.boolean(),
  updatedAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "updatedAt must be a valid ISO date"),
});

/** Schema for the top-level book.json document inside the sync bundle. */
export const syncBundleManifestSchema = z.object({
  bookSlug: bookSlugSchema,
  bookTitle: z.string().min(1).max(200),
  exportedAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "exportedAt must be a valid ISO date"),
  sections: z.array(syncBundleSectionSchema),
});

export type SyncBundleManifest = z.infer<typeof syncBundleManifestSchema>;
export type SyncBundleSection = z.infer<typeof syncBundleSectionSchema>;

// ---------------------------------------------------------------------------
// Sync REST API (/api/v1) request bodies
// ---------------------------------------------------------------------------

/** Max article content size accepted over the sync API (2 MB). */
export const API_MAX_CONTENT_LENGTH = 2_000_000;

/** Validates POST /api/v1/publishers/[publisher]/articles */
export const apiCreateArticleSchema = z.object({
  slug: articleSlugSchema,
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  summary: z.string().max(500, "Summary too long").optional(),
  content: z.string().max(API_MAX_CONTENT_LENGTH, "Content too large"),
});

/**
 * Validates PUT /api/v1/publishers/[publisher]/articles/[slug].
 * `title`/`summary` are optional — when omitted the stored values are kept
 * (external sync edits usually only touch the markdown content).
 */
export const apiUpdateArticleSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long").optional(),
  summary: z.string().max(500, "Summary too long").optional(),
  content: z.string().max(API_MAX_CONTENT_LENGTH, "Content too large"),
  editNote: z.string().max(200).optional(),
});

/** Validates PUT /api/v1/publishers/[publisher]/books/[slug] (reorder/re-group). */
export const apiUpdateBookStructureSchema = z.object({
  sections: z
    .array(
      z.object({
        articleSlug: articleSlugSchema,
        partTitle: z.string().max(200).nullable().default(null),
        chapterTitle: z.string().max(200).nullable().default(null),
      })
    )
    .max(1000),
});

// ---------------------------------------------------------------------------
// API tokens (settings UI)
// ---------------------------------------------------------------------------

/** Validates the "create API token" form. */
export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  expiresInDays: z.coerce.number().int().min(1).max(3650).optional(),
});

/** Validates the "revoke API token" form. */
export const revokeApiTokenSchema = z.object({
  tokenId: z.coerce.number().int().positive("Invalid token ID"),
});

// ---------------------------------------------------------------------------
// Account settings
// ---------------------------------------------------------------------------

/** Validates the display-name update. */
export const updateDisplayNameSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(100, "Display name too long"),
});

/** Validates a password change (current + new). */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(200),
});

// ---------------------------------------------------------------------------
// Article frontmatter metadata
// ---------------------------------------------------------------------------

export const ARTICLE_STATUSES = ["draft", "review", "published", "archived"] as const;

export const articleMetadataSchema = z.object({
  status: z.enum(ARTICLE_STATUSES).default("published"),
  tags: z
    .array(z.string().trim().toLowerCase().min(1).max(50))
    .max(20)
    .default([]),
  description: z.string().max(300).default(""),
  canvas: z
    .string()
    .regex(/^anim-[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .nullable()
    .default(null),
});

export type ArticleMetadata = z.infer<typeof articleMetadataSchema>;

// ---------------------------------------------------------------------------
// Theme token schemas
// ---------------------------------------------------------------------------

/**
 * Single CSS color value: hex (3/4/6/8 digits), rgb/rgba, hsl/hsla, or a
 * small allow-list of keyword values. Deliberately rejects var(...), url(...),
 * semicolons, braces, and other CSS injection vectors.
 */
export const colorTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(
    /^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|hsla?\(\s*\d+(?:\.\d+)?(?:deg)?\s*,\s*\d+(?:\.\d+)?%\s*,\s*\d+(?:\.\d+)?%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|transparent|currentColor)$/,
    "Invalid color value"
  );

/** Full theme-tokens shape; all 17 fields are required and validated. */
export const themeTokensSchema = z.object({
  background:       colorTokenSchema,
  foreground:       colorTokenSchema,
  muted:            colorTokenSchema,
  mutedForeground:  colorTokenSchema,
  border:           colorTokenSchema,
  accent:           colorTokenSchema,
  accentForeground: colorTokenSchema,
  link:             colorTokenSchema,
  linkHover:        colorTokenSchema,
  codeBackground:   colorTokenSchema,
  surface:          colorTokenSchema,
  surfaceHover:     colorTokenSchema,
  primaryBtn:       colorTokenSchema,
  primaryBtnText:   colorTokenSchema,
  inputBorder:      colorTokenSchema,
  inputFocusBorder: colorTokenSchema,
  secondaryText:    colorTokenSchema,
});

export const saveThemeSchema = z.object({
  mode: z.enum(["light", "dark"]),
  tokens: themeTokensSchema,
});

// ---------------------------------------------------------------------------
// Image upload schemas
// ---------------------------------------------------------------------------

/** Validates the `?publisher=` query parameter on the list and upload routes. */
export const uploadImageQuerySchema = z.object({
  publisher: publisherSlugSchema,
});

/** Validates the `?publisher=` query parameter on the list route. */
export const listImagesQuerySchema = z.object({
  publisher: publisherSlugSchema,
});

/**
 * Validates the reconstructed blob pathname on the DELETE route.
 * Accepts paths of the form `images/<publisher-slug>/<filename>.<ext>`.
 */
export const deleteImageBodySchema = z.object({
  path: z
    .string()
    .regex(
      /^images\/[a-z0-9-]+\/[a-z0-9-]+\.(?:jpg|jpeg|png|gif|webp)$/,
      "Invalid blob path"
    ),
});

// ---------------------------------------------------------------------------
// Feature 3: Article verification + notification schemas
// ---------------------------------------------------------------------------

export const markArticleVerifiedSchema = z.object({
  articleId: z.coerce.number().int().positive(),
  publisherSlug: z.string().min(1),
});

export const markNotificationReadSchema = z.object({
  notificationId: z.coerce.number().int().positive(),
});

export const markAllNotificationsReadSchema = z.object({});

// ---------------------------------------------------------------------------
// Feature 5: Article forking schema
// ---------------------------------------------------------------------------

export const forkArticleSchema = z.object({
  sourcePublisherSlug: z.string().min(1),
  sourceArticleSlug: articleSlugSchema,
});

// ---------------------------------------------------------------------------
// Feature 6: Internal citation slug schema
// ---------------------------------------------------------------------------

export const citationSlugSchema = z.string().regex(
  /^[a-z0-9-]+\/article-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "Citation slug must be 'publisher/article-slug'"
);

// ---------------------------------------------------------------------------
// Comment schemas
// ---------------------------------------------------------------------------

/** What a comment thread hangs off: an article (incl. chapters) or a book. */
export const commentSubjectSchema = z.union([
  z.object({ kind: z.literal("article"), slug: z.string().min(1) }),
  z.object({ kind: z.literal("book"), slug: z.string().min(1) }),
]);

export type CommentSubject = z.infer<typeof commentSubjectSchema>;

export const createCommentSchema = z.object({
  parentId: z.coerce.number().int().positive().optional(),
  body: z.string().min(1).max(10_000),
});

/** Guest submissions: display name required, tighter body limit. */
export const guestCommentSchema = z.object({
  parentId: z.coerce.number().int().positive().optional(),
  body: z.string().min(1).max(5_000),
  guestName: z.string().trim().min(2).max(50),
});

export const deleteCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
});

export const editCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
  body: z.string().min(1).max(10_000),
});

export const moderateCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
  status: z.enum(["approved", "spam"]),
});

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export const completeOnboardingSchema = z.object({
  outcome: z.enum(["completed", "skipped"]),
});

export const resetOnboardingSchema = z.object({}).optional();
