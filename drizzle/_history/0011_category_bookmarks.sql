-- Add creator tracking to categories (null = root admin / system)
ALTER TABLE "categories" ADD COLUMN "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL;

-- User-bookmarked categories
CREATE TABLE "category_bookmarks" (
  "user_id"     integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category_id" integer NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  "created_at"  timestamp DEFAULT now(),
  UNIQUE ("user_id", "category_id")
);
