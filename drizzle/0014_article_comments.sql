CREATE TABLE "article_comments" (
  "id"         serial PRIMARY KEY,
  "article_id" integer NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
  "author_id"  integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "parent_id"  integer REFERENCES "article_comments"("id") ON DELETE CASCADE,
  "body"       text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

CREATE INDEX "article_comments_article_idx" ON "article_comments" ("article_id");
CREATE INDEX "article_comments_author_idx"  ON "article_comments" ("author_id");
CREATE INDEX "article_comments_parent_idx"  ON "article_comments" ("parent_id");
