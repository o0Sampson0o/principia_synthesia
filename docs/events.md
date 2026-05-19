# Events & Timeline

## Overview

Events are publisher-scoped records representing discrete points in time (conferences, lectures, releases, etc.). They appear on the global `/timeline` page and each publisher's event list. Visibility is controlled by the same `resourceVisibility` table used for articles and books.

## Database schema

`events` table:
- `id`, `slug` (unique per publisher), `title`, `description`, `eventDate`, `category` (freeform)
- `isEraStart` (bool), `isEraEnd` (bool), `eraName` (text) — era marker fields
- `ownerType` (`"user"` | `"org"`), `ownerId`
- `createdAt`, `updatedAt`
- Indexes on `(ownerType, ownerId)`, `eventDate`, `category`
- Unique constraint on `(ownerType, ownerId, slug)`

`eventArticles` junction table (`eventId → events.id`, `articleId → articles.id`). Both sides cascade-delete.

## Era system

An event can mark the boundary of a named era:
- `isEraStart: true, eraName: "Cold War Era"` — opens the era at this event's year.
- `isEraEnd: true, eraName: "Cold War Era"` — closes the era at this event's year.
- An open era (start with no matching end) gets `endYear: null`.
- `eraName` is required when `isEraStart` or `isEraEnd` is true (validated by Zod).
- `deriveEras(rows)` in `lib/timeline-utils.ts` computes `DerivedEra[]` from raw rows.

## Related articles

Events can be linked to articles from the same publisher via the `eventArticles` table. The `createEvent`/`updateEvent` actions accept a `relatedArticleSlugs` form field (comma-separated slugs). `setEventArticleLinks()` replaces all existing links atomically.

## Validation schemas (`lib/validations.ts`)

- `eventSlugSchema` — must match `/^event-[a-z0-9]+(-[a-z0-9]+)*$/` (reserved `event-` prefix enforced).
- `createEventSchema` — title (max 200), slug, eventDate (ISO date string), description?, category?, relatedArticleSlugs?, isEraStart?, isEraEnd?, eraName?.
- `updateEventSchema` — same as create plus `id` (coerced number).
- `deleteEventSchema` — id (positive int) + slug.

## Routes

Publisher-scoped:

| Route | Purpose |
|---|---|
| `/:publisher/events` | List all publisher events |
| `/:publisher/events/new` | Create event form |
| `/:publisher/events/[eventSlug]` | Event detail (with edit/delete for owner) |
| `/:publisher/events/[eventSlug]/edit` | Edit event form |
| `/:publisher/events/[eventSlug]/access` | Visibility toggle + access grants |

Public:

| Route | Purpose |
|---|---|
| `/timeline` | Global timeline across all public events |

## Server actions

`app/[publisher]/events/actions.ts`:
- `createEvent(publisherSlug, prevState, formData)` — inserts event, sets article links, revalidates paths and `"timeline"` cache tag, redirects to event page.
- `updateEvent(publisherSlug, prevState, formData)` — updates event + article links, revalidates, redirects.
- `deleteEvent(publisherSlug, formData)` — deletes event, revalidates, redirects to events list.

`app/[publisher]/events/[eventSlug]/access/actions.ts`:
- `setEventVisibility(publisherSlug, eventSlug, formData)` — upserts `resourceVisibility` for the event.
- `addEventGrant(publisherSlug, eventSlug, formData)` — inserts an `accessGrants` row for a user or org.
- `removeEventGrant(publisherSlug, eventSlug, formData)` — deletes an `accessGrants` row scoped to all 5 conditions (id, resourceType, ownerType, ownerId, resourceKey).

All actions gate on `canEditContent()`.

## Timeline page (`/timeline`)

`app/timeline/page.tsx` — Server Component.

- Accepts `?category=`, `?publisher=`, `?from=`, `?to=`, `?page=`, `?view=` query params.
- Filters: category (exact), publisher slug, date range (gte/lte on `eventDate`).
- Only shows public events (absent or `visibility = "public"` in `resourceVisibility`).
- Authenticated sessions skip caching; anonymous sessions use `unstable_cache` with tag `"timeline"` and 300s revalidation. Event mutations call `revalidateTag("timeline", "default")` to bust this cache.
- Deduplicates rows by `events.id` after the `GROUP BY` query.
- Two view modes: `"visual"` (default) and `"list"` (via `?view=list`).
- Pagination: 20 events per page.

## Timeline components

All live in `components/`. Pure utility functions shared between them live in `lib/timeline-utils.ts`.

### `VisualTimeline` (server component)

Renders events sorted chronologically in a vertical timeline with a center spine. Era banners (derived by `deriveEras()`) are injected before the first event of each era's start year.

### `ProportionalTimeline` (client component, `"use client"`)

A proportional canvas-like timeline where vertical position is proportional to the year. Features:
- Zoom control: adjusts `pxPerYear` (20–400px). Three card modes: `"full"` (≥60px/yr), `"compact"` (≥30px/yr), `"dot"` (<30px/yr).
- Virtual rendering: only rows within a buffer window around the current scroll position are rendered.
- Scroll position drives a `requestAnimationFrame`-throttled `scrollTop` state.
- Dot mode: clicking a dot opens a popover; clicking outside closes it.
- Year markers spaced by `yearMarkerInterval(pxPerYear)` intervals: 1, 10, 25, or 100 years.

### `TimelineClientShell` (client component)

Wrapper for the visual view. Owns the `proportional` bool toggle. Dynamically imports both `VisualTimeline` and `ProportionalTimeline` with `ssr: false`.

### `TimelineViewToggle` (client component)

Renders list/visual toggle links and the proportional toggle button (visual mode only).

## Utility functions (`lib/timeline-utils.ts`)

- `deriveEras(rows)` → `DerivedEra[]` — processes sorted rows to find era spans from `isEraStart`/`isEraEnd`/`eraName` fields.
- `yearMarkerInterval(pxPerYear)` → year interval for ruler markers.
- `categoryColor(cat)` → deterministic hex color from `DOT_COLORS` via djb2 hash; returns `var(--muted-foreground)` for null.
- Exports `EventRow` and `DerivedEra` types used by both timeline components.

## Access control

Events use the same `resourceVisibility` / `accessGrants` system as articles and books. `ContentType` includes `"event"`. The `setVisibilitySchema` and `addAccessGrantSchema` in `lib/validations.ts` accept `resourceType: "event"`. The global `/timeline` page only queries public events (no `canView()` call — anonymous-friendly).
