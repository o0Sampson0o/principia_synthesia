import { z } from "zod";

/**
 * Validates form data for creating a new article.
 * `categories` is a comma-separated string of slugs (e.g. `"physics,math"`).
 */
export const createArticleSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only"),
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
 * Both `id` and `slug` are required so the action can revalidate the correct path.
 */
export const deleteArticleSchema = z.object({
  id: z.coerce.number().int().positive("Invalid article ID"),
  slug: z.string().min(1),
});

/**
 * Validates form data for adding or updating a curriculum (book) entry.
 * A book has no dedicated table — it is implied by a shared `bookSlug` on
 * multiple `curriculumEntries` rows. `position` controls the reading order;
 * `partTitle` is an optional section heading rendered above the entry.
 */
export const upsertCurriculumEntrySchema = z.object({
  bookSlug: z
    .string()
    .min(1, "Book slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Book slug must be lowercase with hyphens only"),
  bookTitle: z.string().min(1, "Book title is required").max(200, "Book title too long"),
  articleId: z.coerce.number().int().positive("Invalid article ID"),
  position: z.coerce.number().int().min(0, "Position must be non-negative"),
  partTitle: z.string().max(200, "Part title too long").optional().nullable(),
});

/**
 * Validates form data for removing a single article from a curriculum book.
 * `bookSlug` is included so the correct curriculum page can be revalidated.
 */
export const removeCurriculumEntrySchema = z.object({
  id: z.coerce.number().int().positive("Invalid entry ID"),
  bookSlug: z.string().min(1),
});

/**
 * Validates form data for restoring an article to a previous revision.
 * The current content is automatically saved as a new revision before the
 * restore so that the operation can itself be undone.
 */
export const restoreRevisionSchema = z.object({
  revisionId: z.coerce.number().int().positive("Invalid revision ID"),
  articleId: z.coerce.number().int().positive("Invalid article ID"),
});

/**
 * Validates form data for creating an internal (book-only) article.
 * The article is automatically linked to the given book as a curriculum entry.
 */
export const createInternalArticleSchema = z.object({
  bookSlug: z
    .string()
    .min(1, "Book slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Book slug must be lowercase with hyphens only"),
  bookTitle: z.string().min(1, "Book title is required").max(200, "Book title too long"),
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only"),
  position: z.coerce.number().int().min(0, "Position must be non-negative"),
  partTitle: z.string().max(200, "Part title too long").optional().nullable(),
});

/** Validates the login form fields. */
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

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
