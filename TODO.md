# TODO

## Features

- [ ] **Events: recurring events** — support for repeating events (weekly, monthly, annually) in the event schema and UI
- [ ] **Events: bulk import** — CSV/JSON import for events from external sources (e.g. Wikipedia, Wikidata)
- [ ] **Events: search/filter** — filter timeline by era, tag, or keyword; full-text search across event titles and descriptions
- [ ] **Events: era editing UI** — currently eras are seeded; add publisher-facing UI to create and manage eras
- [ ] **Timeline: semantic zoom** — at low zoom levels collapse nearby events into clusters; expand on tap/click
- [ ] **Timeline: keyboard navigation** — arrow key traversal of events in both list and proportional views
- [ ] **Export: events in PDF/EPUB** — include publisher timelines in book exports
- [ ] **Export: EPUB accessibility** — add ARIA roles and landmark nav to EPUB output
- [ ] **Images: alt text enforcement** — warn editors when article images lack alt text
- [ ] **KAO: diagram editing UI** — in-app editor for diagram KAO objects (currently JSON-only)
- [ ] **Auth: email verification** — require verified email before granting publisher-level access
- [ ] **Auth: org invitations** — invite flow for adding members to an org without admin manually granting access
- [ ] **Curriculum: remove external chapter UI** — book edit page has no "remove chapter" action for cross-publisher entries; needs a dedicated remove flow distinct from same-publisher chapter removal (different ownership rules)

## Bugs / Polish

- [ ] **iOS: dialog backdrop scroll-lock** — on iOS, background content behind open `<dialog>` elements can still scroll; needs `-webkit-overflow-scrolling: touch` workaround or JS scroll-lock
- [ ] **PWA: offline edit handling** — NetworkFirst cache strategy will surface network errors offline; show a user-friendly offline message in the editor instead of a raw fetch failure
- [ ] **Timeline proportional view: era label overlap** — era labels can overlap at high event density; implement collision-avoidance or stagger
- [ ] **Nav: focus trap in hamburger menu** — keyboard focus can escape the open mobile nav drawer; needs focus trap implementation
- [ ] **Seed: idempotent re-runs** — most tables still need upsert guards; cross-publisher curriculum entries are already idempotent via `onConflictDoNothing`

## Refactoring / Tech Debt

- [x] **Consolidate plan-*.md files** — all stale planning and fix docs removed from repo root
- [ ] **NavClient.tsx: extract hook** — hamburger open/close state and outside-click logic should live in a `useNavMenu` hook
- [ ] **tests/: event action tests use real Drizzle mocks** — review for consistency with the mock patterns in `tests/lib/access.test.ts`
- [ ] **CSP: remove allowEval from middleware entirely** — confirm no remaining code paths rely on eval; the middleware still carries a conditional `allowEval` flag

## Docs

- [ ] **docs/ui.md: document mobile breakpoints** — record the Tailwind breakpoints and layout decisions made during the mobile overhaul
- [ ] **docs/events.md: document era editing** — once the UI exists, document the era management flow
