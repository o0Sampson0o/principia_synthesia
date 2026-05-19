# UI & Infrastructure

## Layout width system

| Width | Used for |
|---|---|
| `max-w-xl` / `max-w-2xl` | Narrow forms: new book, access control, members, object editor |
| `max-w-3xl` | Medium edit forms: book edit page |
| `max-w-4xl` | Reading & listing pages: article read, chapter, book TOC, articles list, objects list, search, category |
| `max-w-5xl` | Hub/dashboard pages: publisher profile, images, nav bar, footer |
| `max-w-7xl` | Split-editor pages: new/edit article (CodeMirror + preview) |

`components/ContentEditor.tsx` renders a two-column split at `h-[760px]`. CodeMirror inner height: `728px` with toolbar, `760px` without.

## Content Security Policy

`middleware.ts` generates a per-request nonce and sends an enforced `Content-Security-Policy` header (not Report-Only) on every response. The nonce is attached as `x-csp-nonce` so Server Components can pass it to inline scripts.

- `frame-src 'self'` — animation iframes are same-origin.
- `style-src 'unsafe-inline'` — required because KaTeX emits inline `<style>` tags.
- `unsafe-eval` additionally allowed on `/settings/**` and publisher content editor routes (`/:publisher/articles/new`, `/:publisher/articles/[slug]/edit`, `/:publisher/objects/new`, `/:publisher/objects/[slug]/edit`) because CodeMirror requires it.

## Sentry

`@sentry/nextjs` integration. Config files: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`. `instrumentation.ts` loads server/edge configs at runtime. `next.config.ts` is wrapped with `withSentryConfig` for source-map upload and automatic instrumentation. `app/error.tsx` is the root error boundary — captures exceptions to Sentry before showing fallback UI. All four Sentry env vars must be set for monitoring to be active.

## PWA & offline caching

`next.config.ts` wraps Next.js config with `@ducanh2912/next-pwa` (`withPWAInit`). Disabled in development. Generates a Workbox service worker at `public/sw.js` on every production build.

Three runtime caching strategies:
- **article-pages** (`StaleWhileRevalidate`) — any non-admin, non-API, non-`_next` URL; max 100 entries, 7-day TTL.
- **next-static** (`CacheFirst`) — `/_next/static/**`; max 200 entries, 30-day TTL.
- **images** (`CacheFirst`) — common image extensions; max 60 entries, 30-day TTL.

`public/manifest.json` — web app manifest (standalone display, theme_color `#18181b`).

`components/OfflineGuard.tsx` (client component in root layout) renders a fixed amber banner when offline. Initialises with `useState(false)` — SSR-safe. Registers `online`/`offline` event listeners on mount.

**Build requirement:** `npm run build` must use `--webpack`. Turbopack is incompatible with Workbox's webpack plugin.

## Drag-and-drop curriculum reordering

Book edit page uses `@dnd-kit/core` (`DndContext`) and `@dnd-kit/sortable` (`SortableContext`, `verticalListSortingStrategy`). Both `PointerSensor` and `KeyboardSensor` (with `sortableKeyboardCoordinates`) are registered.

On drag end: `arrayMove` computes new order → local state updates immediately → `reorderChapters(publisherSlug, bookSlug, orderedIds)` called in `startTransition`. `reorderChapters` updates each entry's `position` column in a loop.

## Footer & Pricing page

`components/Footer.tsx` (server component): current year copyright, link to `/pricing`, "Support this project" anchor (no-op `#` href). Uses `themed-surface` and `themed-nav-link` / `themed-btn-ghost`.

`app/pricing/page.tsx`: static route listing three tiers (Free / Pro / Team). Pro and Team CTAs are `disabled` buttons (`title="Stripe integration coming soon"`). Free tier CTA links to `/login`.
