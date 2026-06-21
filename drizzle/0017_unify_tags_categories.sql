-- Backfill categories table from frontmatter tags that aren't already categories
INSERT INTO categories (slug, name)
SELECT DISTINCT tag_name, tag_name
FROM articles a
CROSS JOIN LATERAL jsonb_array_elements_text(a.metadata->'tags') AS tag_name
WHERE a.metadata->'tags' IS NOT NULL
  AND a.metadata->'tags' <> 'null'::jsonb
  AND jsonb_array_length(a.metadata->'tags') > 0
ON CONFLICT (slug) DO NOTHING;

-- Backfill article_categories from frontmatter tags
INSERT INTO article_categories (article_id, category_id)
SELECT a.id, c.id
FROM articles a
CROSS JOIN LATERAL jsonb_array_elements_text(a.metadata->'tags') AS tag_name
INNER JOIN categories c ON c.slug = tag_name
WHERE a.metadata->'tags' IS NOT NULL
  AND a.metadata->'tags' <> 'null'::jsonb
ON CONFLICT DO NOTHING;

-- Drop the short-lived tags tables (FK children first)
DROP TABLE IF EXISTS book_tags;
DROP TABLE IF EXISTS article_tags;
DROP TABLE IF EXISTS tags;
