# UI & Infrastructure

## Layout width system

| Width | Used for |
|---|---|
| `max-w-xl` / `max-w-2xl` | Narrow forms: new book, access control, members, object editor |
| `max-w-4xl` | Medium edit forms: book edit page, organizations list |
| `max-w-5xl` | Reading & listing pages: article read, chapter, book TOC, articles list, objects list, search, category, events |
| `max-w-6xl` | Hub/dashboard pages: publisher profile, images, nav bar, footer, timeline |
| `max-w-7xl` | Split-editor pages: new/edit article (CodeMirror + preview) |

`components/ContentEditor.tsx` renders a two-column split at `h-[760px]`. CodeMirror inner height: `728px` with toolbar, `760px` without.

## Responsive breakpoints

Mobile-first. Standard Tailwind breakpoints:

| Breakpoint | Min-width | Behaviour change |
|---|---|---|
| _(default)_ | 0 px | Hamburger nav visible; single-column layouts |
| `sm` | 640 px | Article heading font scales up (`sm:text-3xl`); `ProportionalTimeline` initial `pxPerYear` set to 80 (vs 30 below) |
| `md` | 768 px | Desktop nav links shown (`hidden md:flex`); hamburger hidden (`md:hidden`); mobile nav panel hidden (`md:hidden`) |
| `lg` | 1024 px | Article heading scales up again (`lg:text-4xl`) |
| `xl` | 1280 px | No project-specific behaviour; available for future use |
| `2xl` | 1536 px | No project-specific behaviour; available for future use |

**Per-component notes:**

- **Nav** (`NavClient.tsx`): switches to hamburger at `md:` (768 px). Menu panel closes on route change via `usePathname()` — see the Nav section below.
- **Article reader** (`app/[publisher]/articles/[slug]/page.tsx`): `max-w-5xl`, no column change across breakpoints; horizontal padding is constant.
- **Split editor** (`components/ContentEditor.tsx`): fixed `grid-cols-2` at `h-[760px]` — no responsive collapse. Editors narrow to 50% each at any viewport. Design intent is desktop-only.
- **ProportionalTimeline** (`components/ProportionalTimeline.tsx`): reads `window.innerWidth < 640` on first paint to pick `pxPerYear=30` (mobile) vs `pxPerYear=80` (desktop). This is a one-time init; zoom can be changed by the user afterwards.
- **iOS scroll-lock**: applied to `<body>` when a modal is open. See `docs/ui.md` Nav section and `components/NavClient.tsx`.

## Content Security Policy

`middleware.ts` generates a per-request nonce and sends an enforced `Content-Security-Policy` header (not Report-Only) on every response. The nonce is attached as `x-csp-nonce` so Server Components can pass it to inline scripts.

- `frame-src 'self'` — animation iframes are same-origin.
- `style-src 'unsafe-inline'` — required because KaTeX emits inline `<style>` tags.
- `unsafe-eval` is **dev-only** (Next.js Fast Refresh / Webpack HMR require it in development). No production path includes `unsafe-eval`. MDX preview compilation runs in a server action (`previewMdx` in `app/[publisher]/articles/actions.ts`), so `new Function()` never runs in the browser. The CodeMirror editor (`ContentEditor.tsx`) is used on article edit routes but the version in use (CodeMirror 6) does not require `unsafe-eval`.

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

## Nav

`components/Nav.tsx` is a thin async Server Component that reads the session and passes it down to `components/NavClient.tsx` (a `"use client"` component). This split keeps auth server-side while allowing the client interactivity the mobile nav requires.

`NavClient.tsx` renders a hamburger button (`aria-expanded`) on small viewports. The mobile menu panel closes automatically when the route changes — it calls `usePathname()` and resets the open state in a `useEffect` whenever `pathname` changes. This handles both link clicks and browser back/forward navigation.

## Dialog CSS ownership

All visual properties of native `<dialog>` elements (backdrop, border-radius, background, padding, shadow) are owned by `app/globals.css`, not Tailwind utilities. Tailwind classes on a `<dialog>` element are overridden by the browser's unlayered UA stylesheet, which outranks Tailwind's layered `@layer base` rules. The `.dialog-close-btn` class is also defined in `globals.css` for the same reason. Any new dialog styles must be added in `globals.css`.

## Footer & Pricing page

`components/Footer.tsx` (server component): current year copyright, link to `/pricing`, "Support this project" anchor (no-op `#` href). Uses `themed-surface` and `themed-nav-link` / `themed-btn-ghost`.

`app/pricing/page.tsx`: static route listing three tiers (Free / Pro / Team). Pro and Team CTAs are `disabled` buttons (`title="Stripe integration coming soon"`). Free tier CTA links to `/login`.
