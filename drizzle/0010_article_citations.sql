-- Feature 6: Add article_citations table for internal citation tracking
CREATE TABLE IF NOT EXISTS "article_citations" (
  "id" serial PRIMARY KEY NOT NULL,
  "citing_article_id" integer NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
  "cited_article_id" integer NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "article_citations_citing_article_id_cited_article_id_unique" UNIQUE("citing_article_id","cited_article_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_citations_citing_idx" ON "article_citations" USING btree ("citing_article_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_citations_cited_idx" ON "article_citations" USING btree ("cited_article_id");
