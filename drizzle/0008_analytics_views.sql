-- Feature 4: Add referrer, referrer_source, session_id columns to article_views
ALTER TABLE "article_views" ADD COLUMN IF NOT EXISTS "referrer" text;
--> statement-breakpoint
ALTER TABLE "article_views" ADD COLUMN IF NOT EXISTS "referrer_source" text;
--> statement-breakpoint
ALTER TABLE "article_views" ADD COLUMN IF NOT EXISTS "session_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_views_article_session_idx" ON "article_views" USING btree ("article_id","session_id");
