ALTER TABLE "articles" ADD COLUMN "deleted_at" timestamp;
CREATE INDEX "articles_deleted_at_idx" ON "articles" ("deleted_at") WHERE "deleted_at" IS NOT NULL;
