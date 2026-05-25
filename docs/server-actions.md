# Server Actions

All mutations live in dedicated `actions.ts` files. All use Zod schemas from `lib/validations.ts` for input validation.

| File | Actions |
|---|---|
| `app/[publisher]/articles/actions.ts` | create/update/delete article, restore revision, set categories, `updateArticleContent`, `markArticleVerified` |
| `app/[publisher]/articles/[slug]/access/actions.ts` | `setArticleVisibility`, `addArticleGrant`, `removeArticleGrant` |
| `app/[publisher]/articles/fork-action.ts` | `forkArticle` |
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
| `app/notifications/actions.ts` | `markNotificationRead`, `markAllNotificationsRead` |
| `lib/search.ts` | `searchAll()` — command palette search, exported as `"use server"` |

### Notable action details

**`markArticleVerified`** (`app/[publisher]/articles/actions.ts`) — Resets `articles.last_verified_at` to `now()` for the given article. Requires editor rights on the publisher. Accepts `articleId` and `publisherSlug` from `FormData`. Called from `MarkVerifiedForm.tsx` on article pages.

**`forkArticle`** (`app/[publisher]/articles/fork-action.ts`) — Copies a viewable article into the current user's personal publisher as a draft. Sets `forkedFromId` to the source article's ID. Auto-generates a slug using the pattern `<source-slug>-fork` (or `-fork-2`, `-fork-3`, … up to 10 attempts). Notifies the source article's author(s). Redirects to the new article's edit page.

**`markNotificationRead`** / **`markAllNotificationsRead`** (`app/notifications/actions.ts`) — Set `readAt` to `now()` on one or all unread notifications for the current user. Both call `revalidatePath("/notifications")`. `markNotificationRead` verifies that the notification belongs to the calling user before updating.
