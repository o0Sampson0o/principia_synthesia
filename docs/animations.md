# Animation Authoring Guide

This document explains how to create, store, and embed Canvas-based animations
in Principia Synthesia. Target audience: a developer adding or modifying
animations.

---

## How the animation system works

1. Admin writes a JavaScript function body in the editor at `/admin/animations`.
2. The code string is saved to the `savedAnimations` table (columns: `slug`,
   `name`, `code`).
3. `GET /api/animations/[slug]` generates a self-contained HTML page that
   wraps the code in a `<canvas>` + `<script>` block.
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

### The `window.theme` API

All 15 design tokens are available as `window.theme.<tokenName>` (camelCase).
The correct set (light or dark) is chosen at load time based on
`prefers-color-scheme` and switches live if the user changes their OS setting.

| Token | CSS variable | Typical use |
|---|---|---|
| `background` | `--background` | Page / canvas background |
| `foreground` | `--foreground` | Primary text / lines |
| `muted` | `--muted` | Subdued background areas |
| `mutedForeground` | `--muted-foreground` | Secondary labels |
| `border` | `--border` | Dividers, axis lines |
| `link` | `--link` | Accent / highlight color |
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

Use the `<DynamicAnimation />` MDX component:

```mdx
<DynamicAnimation slug="your-animation-slug" />
```

This renders a 400 px tall iframe. The component reads CSS custom properties
from the live page (`getComputedStyle(document.documentElement)`) and encodes
them as the `?theme=` parameter before the iframe loads, so the animation
always matches the site's current color scheme.

A "View animation →" link to the standalone `/animations/[slug]` page is
rendered below the iframe automatically.

---

## Cache busting

The `buildAnimationSrc` utility (used by `<DynamicAnimation />`) accepts an
optional `version` number that is appended as `&v=<n>` to the iframe URL. The
admin editor increments a local version counter each time the code is saved so
the preview iframe always reflects the latest code.

---

## Theme fallback in the iframe

If the `?theme=` parameter is absent or cannot be parsed (e.g. when the
animation is viewed directly in a browser tab at `/api/animations/[slug]`),
the built-in default tokens from `lib/theme.ts` are used instead. The iframe
still respects `prefers-color-scheme` in this case because the script keeps
both a `_light` and a `_dark` object and switches between them via a
`MediaQueryList` change listener.
