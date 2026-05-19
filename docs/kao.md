# Knowledge as an Object (KAO)

KAO is a typed content primitive stored in the `objects` table.

## Types

`KaoType` union: `"animation"` | `"dataset"` | `"diagram"`. Defined in `lib/kao.ts` with per-type content interfaces and type guard functions.

| Type | Content schema | Preview |
|---|---|---|
| `animation` | `{ code: string }` — JS function for canvas draw loop | `<DynamicAnimation slug={...} />` (iframe sandbox) |
| `dataset` | `{ headers: string[], rows: string[][] }` | HTML table with `themed-surface`, built inline in the object page |
| `diagram` | `{ format: "mermaid" \| "graphviz", source: string }` | `<DiagramRenderer>` — dynamically imports `MermaidDiagram` or `GraphvizDiagram` (both `ssr: false`) |

`DiagramRenderer` is `"use client"`. `matchMedia` is accessed only inside `useEffect` to avoid SSR hydration mismatches.

## Validation schemas

`lib/validations.ts`: `createKaoSchema`, `updateKaoSchema`, `deleteKaoSchema`, `kaoSlugSchema`.

## Publisher UI

- `/:publisher/objects` — lists all objects grouped by type.
- `/:publisher/objects/new` — create a new object.
- `/:publisher/objects/[objSlug]` — edit, delete, and preview.

## Animation system

Animations are stored as KAO objects (`type = "animation"`, `content.code` holds the JS string). Flow:

1. Publisher writes a canvas-based JS function in the object editor.
2. `GET /api/publishers/[publisher]/animations/[slug]` — queries `objects WHERE slug = ? AND type = 'animation'`, extracts `content.code`, and serves a self-contained HTML page wrapping the code in `<canvas>` + `<script>`. Injects `window.theme` (theme token object) from a `?theme=` query param. Access-controlled via `canView()`.
3. `<DynamicAnimation slug="..." />` (client component) reads current CSS variables via `useAnimationSrc`, encodes them into `?theme=`, and renders an `<iframe>` pointing at the API route.
4. Animation code accesses theme colors via `theme.background`, `theme.foreground`, etc.

Iframe isolation means animation code has no access to the parent DOM or CSS.

**SSR safety:** `useAnimationSrc` initialises with `useState(null)` and computes the real `src` in `useEffect` — avoids hydration mismatch from `getComputedStyle`. `DynamicAnimation` renders `null` when `src` is `null`.

## Wikilinks

`[[publisher:objects:slug]]` resolves to `/:publisher/objects/slug`. `[[publisher:objects:slug|Label]]` uses the label as link text. See `lib/remark-wikilinks.ts`.
