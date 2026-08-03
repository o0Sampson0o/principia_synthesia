-- Feature 5: Add forkedFromId self-reference column and index to articles
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "forked_from_id" integer REFERENCES "articles"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_forked_from_idx" ON "articles" USING btree ("forked_from_id");
