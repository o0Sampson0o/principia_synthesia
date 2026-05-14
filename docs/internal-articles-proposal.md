# Proposal: Internal (Book-Only) Articles

This document proposes a structural change to support articles that are inherently part of a specific book and cannot be accessed or managed as standalone entities.

---

## 1. Problem Statement
Currently, all articles in Principia Synthesia are "top-level" entities. Even if they are added to a book (Curriculum), they still exist as standalone pages (e.g., `/my-article`) and appear in global search/category listings. This makes it difficult to create "sub-pages" or "chapters" that only make sense within the context of a specific book.

## 2. Technical Design

### A. Database Schema
Modify the `articles` table in `db/schema.ts` to track "internal" status:

```typescript
export const articles = pgTable("articles", {
  // ... existing fields ...
  isInternal: boolean("is_internal").default(false).notNull(),
  parentBookSlug: text("parent_book_slug"), // The slug of the book it belongs to
});
```

### B. Routing & Access Control
Restrict how these articles are resolved to enforce the "Book-Only" nature:

1.  **Standalone Route (`app/[slug]/page.tsx`)**:
    - Update to query the `isInternal` flag.
    - If `isInternal` is `true`, return `notFound()`.
2.  **Curriculum Route (`app/curriculum/[book]/[slug]/page.tsx`)**:
    - Add a check: if the article is internal, verify that the `[book]` URL segment matches the `parentBookSlug`.
    - If it doesn't match, return `notFound()`.

### C. Filtering (Global Discovery)
Ensure internal articles don't leak into general site navigation:
- **Search**: Filter out `isInternal = true` from search results.
- **Categories**: Exclude internal articles from category-based listings.
- **Sitemap**: Exclude internal articles from `sitemap.ts`.

### D. Admin Workflow
- **Curriculum Manager**: Add a "Create Internal Article" button within each book's entry list.
- **Auto-linking**: When creating an internal article, the system automatically creates the corresponding `curriculum_entries` row with the correct `book_slug`.
- **UI Distinction**: In the main Article List, internal articles should be visually distinguished (e.g., a "Sub-page" badge) or hidden behind a toggle.

## 3. Lifecycle & Data Integrity
- **Deletion**: When a `curriculum_entry` for an internal article is deleted, the underlying `article` row should also be deleted (enforced via cascading or application logic).
- **Snapshots**: Existing snapshot logic is already robust enough to handle this, as it copies content directly into `book_snapshot_entries`.

## 4. Implementation Steps
1. **Migration**: Generate and run a Drizzle migration to add the new columns.
2. **Middleware/Logic**: Update the public page routes to respect the `isInternal` flag.
3. **Actions**: Update `app/admin/actions.ts` to support the creation and deletion of internal articles.
4. **UI**: Enhance the Curriculum Management interface.
