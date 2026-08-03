-- Article slugs become unique per book instead of per publisher, so two books
-- can each hold a section called "intro" without inventing prefixed slugs.
--
-- This replaces one constraint with two PARTIAL unique indexes. A single
-- unique(owner_type, owner_id, parent_book_id, slug) would not work: Postgres
-- treats NULLs as distinct, so every standalone article (parent_book_id IS NULL)
-- would be exempt and duplicate standalone slugs would slip through silently.
--
-- Standalone articles therefore keep publisher-wide uniqueness: they are
-- addressed by /[publisher]/articles/[slug] and by bare `[[pub:articles:slug]]`
-- wikilinks, neither of which carries book context. Only book-internal articles
-- get the relaxed, book-scoped rule.
--
-- The new indexes are strictly weaker than the constraint they replace, so no
-- existing row can violate them and this migration cannot fail on live data.

ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_owner_type_owner_id_slug_unique";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "articles_owner_slug_standalone_idx"
  ON "articles" ("owner_type", "owner_id", "slug")
  WHERE "parent_book_id" IS NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "articles_owner_book_slug_idx"
  ON "articles" ("owner_type", "owner_id", "parent_book_id", "slug")
  WHERE "parent_book_id" IS NOT NULL;
