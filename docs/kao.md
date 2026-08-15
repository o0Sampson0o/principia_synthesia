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

`components/ObjectRender.tsx` is the single place that decides what each type looks like, used by both the object page and `<Embed>` — so an object embedded in an article and the same object on its own page are the same rendering. A new object type is added there once.

## Embedding objects in articles

`<Embed slug="…" />` renders any object (or article) in an article body; see `docs/content.md` → Embeds. The object page offers the exact tag to paste via its "Copy embed tag" button. `<DynamicAnimation>` remains for animations already embedded that way.

Targets are addressed with the wikilink syntax — `<Embed slug="publisher:objects:object-slug" />` — so an object belonging to *another* publisher can be embedded. `parseEmbedTarget` (`lib/embed-resolve.ts`) shares its grammar with `lib/wikilink-syntax.ts` via `parseWikilinkTarget`, which is why the brackets are optional and a `|Label` is tolerated.

Resolution: `lib/embed-resolve.ts` (`resolveEmbed`) — objects win over articles when the address does not say which is meant, access is checked with `canView()`, and anything the viewer may not see resolves to nothing rather than reporting that it exists. The editor Preview reaches the same resolver over `GET /api/publishers/[publisher]/embeds/[slug]`, passing the target through unparsed so both paths interpret it in exactly one place.

## Validation schemas

`lib/validations.ts`: `createKaoSchema`, `updateKaoSchema`, `deleteKaoSchema`, `kaoSlugSchema`.

## Publisher UI

- `/:publisher/objects` — lists all objects grouped by type.
- `/:publisher/objects/new` — create a new object.
- `/:publisher/objects/[objSlug]` — edit, delete, and preview.

## Animation system

Animations are stored as KAO objects (`type = "animation"`, `content.code` holds the JS string). Flow:

1. Publisher writes a canvas-based JS function in the object editor.
2. `GET /api/publishers/[publisher]/animations/[slug]` — queries `objects WHERE slug = ? AND type = 'animation'`, extracts `content.code`, and serves the self-contained HTML page built by `lib/animation-document.ts`, wrapping the code in `<canvas>` + `<script>`. Injects `window.theme` (theme token object) from a `?theme=` query param. Access-controlled via `canView()`.
3. `<DynamicAnimation slug="..." />` (client component) reads current CSS variables via `useAnimationSrc`, encodes them into `?theme=`, and renders an `<iframe>` pointing at the API route.
4. Animation code accesses theme colors via `theme.background`, `theme.foreground`, etc.

Iframe isolation means animation code has no access to the parent DOM or CSS.

**SSR safety:** `useAnimationSrc` initialises with `useState(null)` and computes the real `src` in `useEffect` — avoids hydration mismatch from `getComputedStyle`. `DynamicAnimation` renders `null` when `src` is `null`.

## Wikilinks

`[[publisher:objects:slug]]` resolves to `/:publisher/objects/slug`. `[[publisher:objects:slug|Label]]` uses the label as link text. See `lib/remark-wikilinks.ts`.
