-- Third curriculum level: Part › Chapter › Section. Divider rows (article_id
-- NULL) gain a level discriminator; existing dividers are all Parts. The new
-- Chapter divider is a second label level between Part and the article
-- (renamed Section in the UI/contract). Snapshots carry the folded chapter
-- label alongside the part label.
ALTER TABLE "curriculum_entries" ADD COLUMN "divider_level" text;
UPDATE "curriculum_entries" SET "divider_level" = 'part' WHERE "article_id" IS NULL;
ALTER TABLE "curriculum_entries" ADD CONSTRAINT "curriculum_divider_level_check"
  CHECK ("divider_level" IN ('part', 'chapter') OR "divider_level" IS NULL);

ALTER TABLE "book_snapshot_entries" ADD COLUMN "chapter_title" text;
