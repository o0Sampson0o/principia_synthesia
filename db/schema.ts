import { pgTable, serial, text, timestamp, integer, boolean, unique, foreignKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
});

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  title: text("title").notNull(),
  content: text("content"),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
});

export const articleCategories = pgTable("article_categories", {
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
});

export const revisions = pgTable("revisions", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  content: text("content"),
  editNote: text("edit_note"),
  editedAt: timestamp("edited_at").defaultNow(),
});

// A "book" is just a named slug + title. Entries define its ordered contents.
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

// Saved animations - user-created animations stored in DB
export const savedAnimations = pgTable("saved_animations", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(), // Plain JS animation code
  createdAt: timestamp("created_at").defaultNow(),
});

// User themes - custom themes saved by users
export const userThemes = pgTable("user_themes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  variables: text("variables").notNull(), // JSON string of CSS variables
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
