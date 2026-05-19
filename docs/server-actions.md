# Server Actions

All mutations live in dedicated `actions.ts` files. All use Zod schemas from `lib/validations.ts` for input validation.

| File | Actions |
|---|---|
| `app/[publisher]/articles/actions.ts` | create/update/delete article, restore revision, set categories, `updateArticleContent` |
| `app/[publisher]/articles/[slug]/access/actions.ts` | `setArticleVisibility`, `addArticleGrant`, `removeArticleGrant` |
| `app/[publisher]/books/actions.ts` | create/update/delete book, upsert/remove curriculum entry, `createInternalArticle`, `reorderChapters`, `snapshotBook`, `listBookSnapshots`, `restoreBookSnapshot` |
| `app/[publisher]/books/[bookSlug]/access/actions.ts` | `setBookVisibility`, `addBookGrant`, `removeBookGrant` |
| `app/[publisher]/books/[bookSlug]/sync/actions.ts` | `importSyncBundle` |
| `app/[publisher]/objects/actions.ts` | `createKaoObject`, `updateKaoObject`, `deleteKaoObject` |
| `app/organizations/actions.ts` | `createOrganization`, `deleteOrganization`, `addOrgMember`, `removeOrgMember`, `leaveOrg`, `updateOrgMemberRole` |
| `app/settings/actions.ts` | theme update, `saveColorSchemePreference` |
| `app/login/actions.ts` | login |
| `app/signup/actions.ts` | user registration (creates user + publisher row atomically) |
| `app/[publisher]/events/actions.ts` | `createEvent`, `updateEvent`, `deleteEvent` |
| `app/[publisher]/events/[eventSlug]/access/actions.ts` | `setEventVisibility`, `addEventGrant`, `removeEventGrant` |
| `lib/search.ts` | `searchAll()` — command palette search, exported as `"use server"` |
