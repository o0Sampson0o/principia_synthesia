ALTER TABLE "articles"
  ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL
  DEFAULT '{"status":"published","tags":[],"description":"","canvas":null}'::jsonb;
