-- Migration: book_snapshots, book_snapshot_entries tables + colorSchemePreference on user_themes
-- The user_themes table was already restructured in a prior out-of-band migration.
-- This migration only adds the new column and new tables.

ALTER TABLE "user_themes" ADD COLUMN IF NOT EXISTS "color_scheme_preference" text DEFAULT 'system' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_slug" text NOT NULL,
	"book_title" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_snapshot_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"article_slug" text NOT NULL,
	"article_title" text NOT NULL,
	"article_content" text,
	"position" integer NOT NULL,
	"part_title" text
);
--> statement-breakpoint
ALTER TABLE "book_snapshot_entries" ADD CONSTRAINT "book_snapshot_entries_snapshot_id_book_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."book_snapshots"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "book_snapshot_entries" ADD CONSTRAINT "book_snapshot_entries_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
