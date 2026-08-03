-- Feature 1: Article version snapshots table
CREATE TABLE IF NOT EXISTS "article_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"content_hash" text NOT NULL,
	"short_hash" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "article_snapshots_article_id_content_hash_unique" UNIQUE("article_id","content_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "article_snapshots" ADD CONSTRAINT "article_snapshots_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_snapshots_article_idx" ON "article_snapshots" USING btree ("article_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_snapshots_short_hash_idx" ON "article_snapshots" USING btree ("article_id","short_hash");
