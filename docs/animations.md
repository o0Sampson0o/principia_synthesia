# Animation Authoring Guide

This document explains how to create, store, and embed Canvas-based animations
in Principia Synthesia. Target audience: a developer adding or modifying
animations.

---

## How the animation system works

1. A publisher writes a JavaScript function body in the editor at
   `/:publisher/objects/new` (type: animation) or edits an existing one at
   `/:publisher/objects/[objSlug]/edit`.
2. The code string is saved to the `objects` table (`type = 'animation'`,
   `content.code` holds the JS string). Slugs are unique within a publisher.
3. `GET /api/publishers/[publisher]/animations/[slug]` generates a
   self-contained HTML page that wraps the code in a `<canvas>` + `<script>`
   block.
4. `<DynamicAnimation slug="your-slug" />` (a client component) reads the
   current page's CSS custom properties, encodes them into the `?theme=` query
   parameter, and renders an `<iframe>` pointing at the API route.
5. The iframe's page script injects all theme tokens as `window.theme` before
   calling the animation function.

The iframe is fully sandboxed — it has no access to the parent page's DOM,
CSS, or JavaScript. The only shared data is whatever the parent encodes into
the `?theme=` URL parameter.

---

## Writing animation code

### Structure

The API route looks for the **first `function` declaration** in your code and
calls it automatically after `DOMContentLoaded`. For example:

```js
function MyAnimation() {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width  = 800;
  canvas.height = 600;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = window.theme.foreground;
    ctx.fillRect(100, 100, 200, 200);
    requestAnimationFrame(draw);
  }

  draw();
}
```

The generated page runs this after the DOM is ready:

```html
<script>
  // ... window.theme injection ...
  window.addEventListener('DOMContentLoaded', function() {
    function MyAnimation() { /* your code */ }
    MyAnimation();
  });
</script>
```

If your code does not contain a `function` declaration (e.g. it is an IIFE or
uses a module pattern), no automatic call is appended — you must trigger
execution yourself.

### The canvas element

The page always provides a single `<canvas id="canvas">` element. The canvas
has `max-width: 100%; max-height: 100vh; object-fit: contain` set via CSS, so
it scales to fit the iframe without scrollbars. Set its internal resolution via
`canvas.width` and `canvas.height` inside your function.

### Frame height

There are two separate dimensions, and they do different jobs:

- **Canvas resolution** — `canvas.width` / `canvas.height`, set in your code.
  This is the drawing surface and its aspect ratio.
- **Frame height** — how tall the embedded iframe is, in pixels. Stored *on the
  animation object* and edited in the "Frame height" field in the animation
  editor. Between 120 and 1600; defaults to 400.

Because the height belongs to the object, one animation is the same size
everywhere it appears — article embeds, the object page, the editor preview,
and exported book bundles. It is deliberately **not** a prop on
`<DynamicAnimation>`: an embedding article cannot override it.

If your canvas is much taller than the frame, `object-fit: contain` shrinks it
and leaves empty space at the sides. Match the frame height to your canvas
aspect ratio to avoid that.

Mechanically, the iframe route reads the stored height and `postMessage`s it to
the embedder on load, so no page needs its own query to size the frame. See
`lib/animation-dimensions.ts` and `components/AnimationFrame.tsx`.

### The `window.theme` API

All 17 design tokens are available as `window.theme.<tokenName>` (camelCase).
The correct set (light or dark) is chosen at load time based on
`prefers-color-scheme` and switches live if the user changes their OS setting.

| Token | CSS variable | Typical use |
|---|---|---|
| `background` | `--background` | Page / canvas background |
| `foreground` | `--foreground` | Primary text / lines |
| `muted` | `--muted` | Subdued background areas |
| `mutedForeground` | `--muted-foreground` | Secondary labels |
| `border` | `--border` | Dividers, axis lines |
| `accent` | `--accent` | Brand accent, emphasis |
| `accentForeground` | `--accent-foreground` | Text on an accent fill |
| `link` | `--link` | Link color |
| `linkHover` | `--link-hover` | Emphasized accent |
| `codeBackground` | `--code-background` | Code block backgrounds |
| `surface` | `--surface` | Raised surfaces (cards, nav) |
| `surfaceHover` | `--surface-hover` | Hovered surface state |
| `primaryBtn` | `--primary-btn` | Primary button / CTA fill |
| `primaryBtnText` | `--primary-btn-text` | Text on primary button |
| `inputBorder` | `--input-border` | Form input borders |
| `inputFocusBorder` | `--input-focus-border` | Focused input border |
| `secondaryText` | `--secondary-text` | Labels, nav links |

All values are hex color strings (e.g. `"#18181b"`).

Example — drawing a filled circle in the theme's accent color:

```js
function CircleDemo() {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 400;
  canvas.height = 400;

  ctx.fillStyle = window.theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.arc(200, 200, 100, 0, Math.PI * 2);
  ctx.fillStyle = window.theme.primaryBtn;
  ctx.fill();
}
```

---

## Embedding an animation in an article

Three ways, for three different intentions.

### A stored animation — `<Embed />`

```mdx
<Embed slug="your-publisher:objects:anim-your-animation" />
```

The general form: one tag for any object, addressed the same way a wikilink is
— so an animation belonging to another publisher embeds just as easily. A bare
`slug="anim-your-animation"` is shorthand for "this article's publisher". Copy
the exact tag from the object page's "Copy embed tag" button. See
`docs/content.md` → Embeds.

### An animation written inside the article — the ```animation fence

````mdx
```animation height=400
function Wave() {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  // ...
}
```
````

For an animation that belongs to one article and does not need to exist as a
reusable object. Everything on this page applies unchanged — same sandboxed
iframe, same `window.theme`, same "first `function` declaration is the entry
point" rule — because both go through `buildAnimationDocument`
(`lib/animation-document.ts`).

Two differences from a stored animation:

- **Frame height** comes from the fence meta (`height=400`), since there is no
  object to store it on. Same 120–1600 range, same 400 default.
- **No "View animation →" link**, since there is no object page to link to.

The document is handed to the iframe as `srcdoc` rather than fetched by URL. A
`srcdoc` frame inherits the page's CSP, so its inline `<script>` carries the
page nonce, read from the DOM by `lib/csp-nonce.ts` — without it the animation
is silently blocked.

Book exports (EPUB, PDF) replace the fence with an "Animation — view online."
line rather than printing its source; see `remarkFencedEmbedsStatic`.

### The original form — `<DynamicAnimation />`

Still supported, and what `canvas:` frontmatter generates:

```mdx
<DynamicAnimation publisher="your-publisher-slug" slug="anim-your-animation" />
```

Both props are required. Articles with a `canvas:` frontmatter value get this
tag prepended automatically, with `publisher` filled in — see
`prepareArticleBody` in `lib/article-mdx.tsx`.

The iframe is sized by the animation's stored frame height (see above), not by
the embed. The component reads CSS custom properties
from the live page (`getComputedStyle(document.documentElement)`) and encodes
them as the `?theme=` parameter before the iframe loads, so the animation
always matches the site's current color scheme.

A "View animation →" link to the standalone object page is rendered below the
iframe automatically.

---

## Cache busting

The `buildAnimationSrc` utility (used by `<DynamicAnimation />`) accepts an
optional `version` number that is appended as `&v=<n>` to the iframe URL. The
admin editor increments a local version counter each time the code is saved so
the preview iframe always reflects the latest code.

---

## Theme fallback in the iframe

If the `?theme=` parameter is absent or cannot be parsed (e.g. when the
animation is viewed directly in a browser tab at
`/api/publishers/[publisher]/animations/[slug]`), the built-in default tokens
from `lib/theme.ts` are used instead. The iframe still respects
`prefers-color-scheme` in this case because the script keeps both a `_light`
and a `_dark` object and switches between them via a `MediaQueryList` change
listener.
