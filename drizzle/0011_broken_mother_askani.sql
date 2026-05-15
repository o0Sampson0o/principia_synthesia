ALTER TABLE "objects" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN "plugin_meta" jsonb;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM saved_animations sa
    JOIN objects o ON o.slug = sa.slug
  ) THEN
    RAISE EXCEPTION 'Slug collision between saved_animations and objects; rename one side before migrating.';
  END IF;
END $$;--> statement-breakpoint
INSERT INTO "objects" (slug, name, type, content, description, created_at, updated_at, source, plugin_meta)
SELECT
  slug,
  name,
  'animation' AS type,
  jsonb_build_object('code', code) AS content,
  NULL AS description,
  created_at,
  created_at AS updated_at,
  source,
  plugin_meta
FROM saved_animations;--> statement-breakpoint
DROP TABLE "saved_animations";
