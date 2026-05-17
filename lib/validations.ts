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
});

// ---------------------------------------------------------------------------
// Book schemas
// ---------------------------------------------------------------------------

/** Validates form data for creating a book. */
export const createBookSchema = z.object({
  slug: bookSlugSchema,
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
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
});

/**
 * Validates form data for adding or updating a curriculum (book) entry.
 * Uses `bookId` FK instead of the old `bookSlug`/`bookTitle` denormalised pair.
 */
export const upsertCurriculumEntrySchema = z.object({
  bookId: z.coerce.number().int().positive("Invalid book ID"),
  articleId: z.coerce.number().int().positive("Invalid article ID"),
  position: z.coerce.number().int().min(0, "Position must be non-negative"),
  partTitle: z.string().max(200, "Part title too long").optional().nullable(),
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
  partTitle: z.string().max(200, "Part title too long").optional().nullable(),
});

// ---------------------------------------------------------------------------
// Visibility + access grant schemas
// ---------------------------------------------------------------------------

export const setVisibilitySchema = z.object({
  resourceType: z.enum(["book", "article", "object"]),
  ownerType: z.enum(["user", "org"]),
  ownerId: z.coerce.number().int().positive("Invalid owner ID"),
  resourceKey: z.string().min(1, "Resource key is required"),
  visibility: z.enum(["public", "org", "private"]),
});

export const addAccessGrantSchema = z.object({
  resourceType: z.enum(["book", "article", "object"]),
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

// ---------------------------------------------------------------------------
// Sync bundle schemas (retained; plugin manifest schemas removed)
// ---------------------------------------------------------------------------

/**
 * Schema for a single chapter entry inside the sync bundle's book.json.
 * `updatedAt` is an ISO 8601 string (validated by Date.parse, not z.date()).
 */
export const syncBundleChapterSchema = z.object({
  slug: articleSlugSchema,
  title: z.string().min(1).max(200),
  partTitle: z.string().max(200).nullable().optional(),
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
  chapters: z.array(syncBundleChapterSchema),
});

export type SyncBundleManifest = z.infer<typeof syncBundleManifestSchema>;
export type SyncBundleChapter = z.infer<typeof syncBundleChapterSchema>;

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
