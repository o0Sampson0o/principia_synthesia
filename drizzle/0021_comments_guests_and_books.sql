-- Generalize article_comments into comments: guest (no-account) authors and
-- whole-book discussion threads. Chapters are articles, so chapter comments
-- keep using article_id; exactly one of article_id/book_id is set per row.
ALTER TABLE "article_comments" RENAME TO "comments";
ALTER INDEX "article_comments_article_idx" RENAME TO "comments_article_idx";
ALTER INDEX "article_comments_author_idx" RENAME TO "comments_author_idx";
ALTER INDEX "article_comments_parent_idx" RENAME TO "comments_parent_idx";

ALTER TABLE "comments" ALTER COLUMN "article_id" DROP NOT NULL;
ALTER TABLE "comments" ALTER COLUMN "author_id" DROP NOT NULL;

ALTER TABLE "comments" ADD COLUMN "book_id" integer REFERENCES "books"("id") ON DELETE CASCADE;
ALTER TABLE "comments" ADD COLUMN "guest_name" text;
ALTER TABLE "comments" ADD COLUMN "guest_token_hash" text;
ALTER TABLE "comments" ADD COLUMN "ip_hash" text;
ALTER TABLE "comments" ADD COLUMN "status" text NOT NULL DEFAULT 'approved';

ALTER TABLE "comments" ADD CONSTRAINT "comments_subject_check"
  CHECK (("article_id" IS NULL) <> ("book_id" IS NULL));
ALTER TABLE "comments" ADD CONSTRAINT "comments_guest_name_check"
  CHECK ("author_id" IS NOT NULL OR "guest_name" IS NOT NULL);
ALTER TABLE "comments" ADD CONSTRAINT "comments_status_values_check"
  CHECK ("status" IN ('pending', 'approved', 'spam'));

CREATE INDEX "comments_book_idx" ON "comments" ("book_id");
CREATE INDEX "comments_status_idx" ON "comments" ("status");

-- Per-publisher toggle: let guest comments skip the moderation queue.
ALTER TABLE "publishers" ADD COLUMN "allow_unmoderated_guests" boolean NOT NULL DEFAULT false;
