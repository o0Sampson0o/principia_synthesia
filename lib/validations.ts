import { z } from "zod";

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

export const updateArticleSchema = createArticleSchema.extend({
  id: z.coerce.number().int().positive("Invalid article ID"),
});

export const deleteArticleSchema = z.object({
  id: z.coerce.number().int().positive("Invalid article ID"),
  slug: z.string().min(1),
});

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

export const removeCurriculumEntrySchema = z.object({
  id: z.coerce.number().int().positive("Invalid entry ID"),
  bookSlug: z.string().min(1),
});

export const restoreRevisionSchema = z.object({
  revisionId: z.coerce.number().int().positive("Invalid revision ID"),
  articleId: z.coerce.number().int().positive("Invalid article ID"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
