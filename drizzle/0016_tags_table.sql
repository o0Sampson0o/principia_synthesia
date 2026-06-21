-- Global tag registry
CREATE TABLE tags (
  id serial PRIMARY KEY,
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Article-tag join
CREATE TABLE article_tags (
  article_id integer NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id integer NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE (article_id, tag_id)
);

-- Book-tag join
CREATE TABLE book_tags (
  book_id integer NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id integer NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE (book_id, tag_id)
);

-- Backfill: seed unique tag names from articles.metadata->'tags'
INSERT INTO tags (name)
SELECT DISTINCT jsonb_array_elements_text(metadata->'tags')
FROM articles
WHERE metadata->'tags' IS NOT NULL
  AND metadata->'tags' <> 'null'::jsonb
  AND jsonb_array_length(metadata->'tags') > 0
ON CONFLICT (name) DO NOTHING;

-- Backfill: seed unique tag names from books.metadata->'tags'
INSERT INTO tags (name)
SELECT DISTINCT jsonb_array_elements_text(metadata->'tags')
FROM books
WHERE metadata->'tags' IS NOT NULL
  AND metadata->'tags' <> 'null'::jsonb
  AND jsonb_array_length(metadata->'tags') > 0
ON CONFLICT (name) DO NOTHING;

-- Backfill: populate article_tags from existing JSONB data
INSERT INTO article_tags (article_id, tag_id)
SELECT a.id, t.id
FROM articles a
CROSS JOIN LATERAL jsonb_array_elements_text(a.metadata->'tags') AS tag_name
INNER JOIN tags t ON t.name = tag_name
WHERE a.metadata->'tags' IS NOT NULL
  AND a.metadata->'tags' <> 'null'::jsonb
ON CONFLICT (article_id, tag_id) DO NOTHING;

-- Backfill: populate book_tags from existing JSONB data
INSERT INTO book_tags (book_id, tag_id)
SELECT b.id, t.id
FROM books b
CROSS JOIN LATERAL jsonb_array_elements_text(b.metadata->'tags') AS tag_name
INNER JOIN tags t ON t.name = tag_name
WHERE b.metadata->'tags' IS NOT NULL
  AND b.metadata->'tags' <> 'null'::jsonb
ON CONFLICT (book_id, tag_id) DO NOTHING;
