-- Parts become first-class curriculum entries: a row with a NULL article_id
-- and a part_title is a standalone, reorderable part divider. Existing
-- "partTitle on the chapter that starts the part" data is converted by
-- inserting a divider row immediately before each such chapter.
ALTER TABLE "curriculum_entries" ALTER COLUMN "article_id" DROP NOT NULL;

-- Spread positions so a divider fits before each chapter without collisions.
UPDATE "curriculum_entries" SET "position" = "position" * 2 + 1;

INSERT INTO "curriculum_entries" ("book_id", "article_id", "position", "part_title")
SELECT "book_id", NULL, "position" - 1, "part_title"
FROM "curriculum_entries"
WHERE "part_title" IS NOT NULL AND "article_id" IS NOT NULL;

UPDATE "curriculum_entries" SET "part_title" = NULL WHERE "article_id" IS NOT NULL;
