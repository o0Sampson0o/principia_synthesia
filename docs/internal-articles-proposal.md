# Internal (Book-Only) Articles

Internal articles are articles that belong exclusively to one book and cannot
be accessed or managed as standalone entities. This document describes the
implemented design.

---

## Overview

An internal article is created from within the book's admin page and is
permanently linked to that book. It does not appear in global search, category
listings, the homepage, the sitemap, or the command palette. It can only be
read at the book chapter URL.

---

## Database schema

Two columns on the `articles` table track internal status:

```ts
isInternal: boolean("is_internal").default(false).notNull(),
parentBookId: integer("parent_book_id").references(() => books.id, { onDelete: "cascade" }),
```

- `isInternal = true` marks the article as book-only.
- `parentBookId` is a FK to `books.id`. When the parent book is deleted,
  internal articles cascade-delete automatically.

(Note: the column is `parentBookId` FK to `books.id`, not a text `parentBookSlug`
column.)

---

## Routing and access control

### Standalone article route (`/:publisher/articles/[slug]`)

If `article.isInternal === true`, the route calls `notFound()` immediately.
Internal articles are never accessible via their standalone URL.

### Book chapter route (`/:publisher/books/[bookSlug]/[chapter]`)

The route verifies two conditions for internal articles:
1. The article's `parentBookId` must match the resolved book's `id`.
2. If it does not match, `notFound()` is returned — an internal article cannot
   be read through a different book's URL.

---

## Filtering from global discovery

Internal articles are excluded from:

- **Search** — the search query filters out `isInternal = true` rows.
- **Categories** — category listing pages exclude internal articles.
- **Homepage** — the "recently updated" query filters out `isInternal = true`.
- **Sitemap** — internal articles are not included in `sitemap.ts`.
- **Command palette** — `searchAll()` excludes internal articles.

---

## Admin workflow

The "New internal article" form lives on the book's admin page. It calls
`createInternalArticle()` in the publisher's server actions file, which
atomically:

1. Inserts the article with `isInternal = true` and `parentBookId` set to the
   book's `id`.
2. Inserts the corresponding `curriculumEntries` row at the next available
   position.

The article immediately appears in the book's entry list on the admin page and
is accessible at `/:publisher/books/[bookSlug]/[chapter]`.

---

## Lifecycle and data integrity

### Removing a curriculum entry

`removeCurriculumEntry()` checks `article.isInternal`. If true, it
permanently deletes the article (revisions and category links cascade-delete).
If false (a regular article), only the `curriculumEntries` row is removed — the
article itself is preserved.

### Deleting a book

`deleteBook()` (or removing all entries for a book) also permanently deletes
all internal articles owned by that book because `parentBookId` has
`onDelete: "cascade"`.

### Editing and revisions

`updateArticle()` and `restoreRevision()` are aware of `isInternal`. After
saving, they redirect to `/:publisher/books/[parentBookSlug]/[slug]` rather than
`/:publisher/articles/[slug]`.

### Snapshots

Snapshot logic (`snapshotBook()`, `restoreBookSnapshot()`) treats internal
articles the same as regular articles — content is copied into
`bookSnapshotEntries` as usual. The `articleContent` field in the snapshot entry
allows content to be optionally rolled back.
