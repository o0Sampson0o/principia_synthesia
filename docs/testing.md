# Testing

The test suite uses **Vitest** with jsdom (component tests) and node environments. Test files live in `tests/`.

## Key patterns

- Files that use jose JWT signing must use `// @vitest-environment node` to avoid jsdom's cross-realm `Uint8Array` issue.
- `vi.hoisted()` is required for mock variables referenced in `vi.mock()` factory functions.
- Drizzle query builder mocks chain with `mockReturnValue` for intermediate steps and `mockResolvedValue` for terminals.
- `redirect()` from `next/navigation` throws an error — tests that call actions which redirect should use `expect(...).rejects.toThrow("NEXT_REDIRECT")`.

## Test file listing

```
tests/
  setup.ts                          # global setup: jest-dom matchers, next/* mocks
  middleware.test.ts                 # CSP nonce, rate-limit, settings auth gate
  middleware-csp.test.ts             # CSP header content and nonce behaviour
  lib/
    access.test.ts                   # canView, filterVisible
    article-sections.test.ts         # parseArticleSections, reconstructMdx
    auth.test.ts                     # hashPassword, JWT, getSession (node env)
    book-toc.test.ts                 # book table-of-contents helpers
    build-book-bundle.test.ts        # offline bundle builder
    epub.test.ts                     # EPUB export pipeline
    frontmatter.test.ts              # parseFrontmatter, serializeFrontmatter
    images.test.ts                   # image upload/delete helpers
    license.test.ts                  # isValidLicense, featureEnabled
    pagination.test.ts               # pagination utility
    rate-limit.test.ts               # in-memory rate limiter
    remark-wikilinks.test.ts         # remarkWikilinks remark plugin
    search.test.ts                   # searchAll
    theme.test.ts                    # buildThemeStyle, defaultThemeStyle (node env)
    useAnimationSrc.test.ts          # buildAnimationSrc, useAnimationSrc hook
    validate-animation.test.ts       # animation script validator
    validations.test.ts              # Zod schemas
    validations-events.test.ts       # event Zod schemas and era constraints
    timeline-utils.test.ts           # deriveEras, yearMarkerInterval, categoryColor
  api/
    publisher-animations-route.test.ts  # GET /api/publishers/[publisher]/animations/[slug]
    images-upload-route.test.ts         # POST /api/images/upload
    images-list-route.test.ts           # GET /api/images/list
    images-delete-route.test.ts         # DELETE /api/images/[...path]
  actions/
    access-actions.test.ts           # setBookVisibility, addBookGrant, etc. (node env)
    settings-actions.test.ts         # theme, saveColorSchemePreference
    event-actions.test.ts            # createEvent, updateEvent, deleteEvent (node env)
    event-access-actions.test.ts     # removeEventGrant scoping (node env)
  components/
    ArticleImage.test.tsx            # ArticleImage component
    OfflineGuard.test.tsx            # OfflineGuard component
```
