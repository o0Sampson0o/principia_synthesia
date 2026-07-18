---
name: Principia Synthesia
description: Precision Editorial — a quiet library where arXiv rigor, blogging ease, and textbook coherence stay beautiful for hours.
colors:
  quiet-iris: "#6366f1"
  ink: "#18181b"
  page-ground: "#f7f7f8"
  surface-white: "#ffffff"
  mist: "#f4f4f5"
  graphite: "#71717a"
  hairline: "#e4e4e7"
  error-red: "#ef4444"
  success-green: "#16a34a"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(1.75rem, 4vw, 2.75rem)"
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "ui-monospace, Geist Mono, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    letterSpacing: "0.05em"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  pill: "9999px"
spacing:
  row: "0.875rem"
  gutter: "1.25rem"
  section: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.quiet-iris}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1.25rem"
  button-outline:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.4375rem 1rem"
  input:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  tag:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
---

# Design System: Principia Synthesia

## 1. Overview

**Creative North Star: "The Quiet Library"**

Principia Synthesia's visual system is a quiet library: hushed authority, knowledge at rest, comfort measured in hours rather than glances. Playfair Display carries editorial weight at display sizes; Geist Sans does the working text; a monospace whisper handles dates, counts, and slugs. Depth comes from hairline borders and surface tone, never decoration. The single indigo accent — Quiet Iris — speaks rarely, which is why it is heard.

The system explicitly rejects its two neighbors. It refuses **Web-1.0 academic** rawness: rigor here is typeset, never dumped. And it refuses the **cluttered wiki**: no boxes-within-boxes, no sidebars fighting the prose, no link thickets. The page is a reading surface first; chrome exists to disappear. Every token is user-themable (15 tokens × light/dark), so all color flows through CSS custom properties — a hardcoded hex is a broken promise to the theming system.

**Key Characteristics:**
- Serif gravitas at display sizes only; sans for all working UI
- One accent, used at ≤10% of any screen
- Depth = 1px hairline + surface tone; shadows reserved for floating overlays
- Monospace micro-labels for metadata (dates, counts, statuses)
- Built for the long session: generous line-height, restrained motion, WCAG AA contrast

## 2. Colors

A restrained, ink-on-fog palette where the only voice with color is the accent.

### Primary
- **Quiet Iris** (#6366f1 light / #818cf8 dark): the sole accent. Primary action buttons, current selection, focus rings, eyebrow labels, active links. Its rarity is deliberate — if a screen feels colorful, Quiet Iris is being overused.

### Neutral
- **Ink** (#18181b light / #fafafa dark): primary text and headings; also the dark primary-button ground.
- **Page Ground** (#f7f7f8 light / #0b0b0d dark): the faintly cool page background everything sits on.
- **Surface White** (#ffffff light / #151517 dark): cards, panels, nav — lifts off the page ground by tone, not shadow.
- **Mist** (#f4f4f5 light / #27272a dark): chips, code grounds, table headers, hover fills.
- **Graphite** (#71717a light / #a1a1aa dark): secondary text, metadata, quiet labels.
- **Hairline** (#e4e4e7 light / #3f3f46 dark): every divider, card outline, and input border.

### Semantic (fixed, not themable)
- **Error Red** (#ef4444) and **Success Green** (#16a34a): validation and status only, never decoration.

### Named Rules
**The One Voice Rule.** Quiet Iris appears on at most 10% of any screen — primary actions, selection, focus. Everything else is ink, graphite, and tone.

**The Token Rule.** Every color goes through a CSS custom property (`--accent`, `--surface`, …). Hardcoding a hex in a component is prohibited; users retheme all 15 tokens, and a hardcoded value breaks their theme.

## 3. Typography

**Display Font:** Playfair Display (with Georgia, serif)
**Body Font:** Geist Sans (with system-ui, sans-serif)
**Label/Mono Font:** ui-monospace / Geist Mono

**Character:** A serif/sans contrast pairing — Playfair brings the bound-volume gravitas, Geist keeps the working surface crisp and legible for hours. The mono layer marks machine facts (dates, counts, hashes) as quietly different from prose.

### Hierarchy
- **Hero** (500, clamp to ≤4.5rem, line-height 1.02, letter-spacing -0.04em): page-level heroes only (`.ps-hero`); `text-wrap: balance`.
- **Display** (500, clamp(1.75rem, 4vw, 2.75rem), line-height 1.12, letter-spacing -0.03em): page titles, publisher names, article titles (`.ps-display`).
- **Body** (400, 1rem, line-height 1.6–1.65): prose and UI text; reading column capped at `max-w-3xl` (~68ch).
- **Label / mono metadata** (400, 0.6875rem, letter-spacing 0.05em, `.ps-mono-meta`): dates, counts. The uppercase micro variant (`.ps-mono-micro`, 0.5625rem, tracking 0.1em) marks statuses and section micro-labels.
- **Eyebrow** (0.6875rem, tracking 0.1em, uppercase): accent-colored section pre-label (`.ps-eyebrow`); muted variant for column headers.

### UI type scale (the working ramp)
UI text steps between Body and the mono labels are drawn from this ramp —
values off it are drift: **1.125 / 1.0625 / 1 / 0.9375 / 0.875 / 0.8125 /
0.75 / 0.6875 / 0.625 / 0.5625 rem**. The article summary sits at 1.0625rem
deliberately (a dek, not body). Sizes below 0.5625rem are permitted only as
micro-labels inside dense data visualizations (timeline ticks, SVG bar
labels) where the value also appears elsewhere at a legible size.

### Named Rules
**The Playfair Threshold Rule.** Playfair Display appears only at display sizes (≥1.5rem). It is forbidden in buttons, labels, body text, or data — working UI is always Geist.

**The Mono Fact Rule.** Numbers about the system (counts, dates, versions, statuses) render in the mono metadata style, lowercase or small-caps, never bold.

## 4. Elevation

Flat by doctrine. Depth is conveyed by hairline borders (#e4e4e7) and stepped surface tone (page ground → surface → mist), never by resting shadows. The dark theme lifts panels the same way: tone steps from #0b0b0d to #151517 to #27272a.

### Shadow Vocabulary
- **Floating overlay** (`box-shadow: 0 10px 34px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.06)`): reserved exclusively for elements that float above the document — context menus, dialogs. Nothing that sits *in* the page casts a shadow.

### Named Rules
**The Hairline Rule.** If an element rests in the page flow, its depth budget is one 1px border and one surface-tone step. A resting card with a shadow is drift.

## 5. Components

Refined and restrained: controls recede until needed, borders are precise, and the accent appears only where an action is primary.

### Buttons
- **Shape:** gently rounded (0.5rem via `rounded-lg`; the class default 0.375rem is always upgraded by pairing `themed-btn-accent rounded-lg`)
- **Primary:** Quiet Iris ground, white text, 0.5rem × 1.25rem padding (`themed-btn-accent rounded-lg`) — the one standard primary across the entire app
- **Hover / Focus:** opacity eases to 0.85 (150ms); keyboard focus draws a 2px Quiet Iris outline offset 2px
- **Outline:** hairline border, ink text, surface ground (`themed-btn-outline`) — secondary actions
- **Ghost / Danger:** borderless quiet text (`themed-btn-ghost`); destructive confirmation uses fixed #dc2626 (`themed-btn-danger`)

### Chips / Tags
- **Style:** full-pill hairline outline, graphite text (`themed-tag`); filled variant on mist (`themed-category-pill`)
- **State:** status badges use the uppercase mono micro-label inside a pill

### Cards / Containers
- **Corner Style:** 0.5rem
- **Background:** Surface White over Page Ground
- **Shadow Strategy:** none at rest (see The Hairline Rule)
- **Border:** 1px hairline, darkening on hover (`themed-card`)
- **Internal Padding:** 1rem–1.25rem; list rows prefer plain `border-b` hairline dividers over boxed cards

### Inputs / Fields
- **Style:** 1px hairline stroke, surface ground, 0.375rem radius (`themed-input`)
- **Focus:** border shifts to the darker input-focus token; global 2px accent outline for keyboard focus
- **Error:** message line in Error Red (0.8125rem), never a red border alone

### Navigation
- **Style:** surface-toned bar with bottom hairline (`themed-nav`); links in graphite easing to ink on hover (`themed-nav-link`); underline tabs mark the active section (`.ps-tab`)

### Toasts (error & status)
Errors never reshape the page. Server actions **return** `{ error }` (they do
not redirect on failure), a client `ToastForm` wrapper surfaces it as a
floating `ps-toast` — surface + hairline + floating-overlay shadow, mono micro
label, bottom-right, auto-dismiss — and the form keeps its scroll position and
typed values. `SearchParamToast` covers the rare genuine cross-page arrival
(e.g. the email-verification link landing on `/login`). Per-field validation
stays inline on its input; a toast can't point at a field.

### List Row (signature)
The app's characteristic surface: flush rows divided by hairlines, 0.875rem vertical padding, hover fill to surface tone, and a trailing "→" that fades in at 50% opacity on hover. Used for articles, search results, queues, and indexes — the anti-card.

## 6. Do's and Don'ts

### Do:
- **Do** route every color through the theme tokens; the 15-token light/dark system is the single source of truth.
- **Do** pair `themed-btn-accent` with `rounded-lg` — that pairing IS the primary button.
- **Do** use hairline dividers and surface tone for structure; reach for the list-row pattern before inventing a card.
- **Do** mark metadata (dates, counts, statuses) in the mono micro-label style.
- **Do** keep reading columns at `max-w-3xl` and body line-height ≥1.6 — the long session is the product.
- **Do** honor reduced motion (global safety net exists) and the global `:focus-visible` accent ring.

### Don't:
- **Don't** ship **Web-1.0 academic** rawness — unstyled density, default-font dumps, naked tables. Rigor must be typeset.
- **Don't** build the **cluttered wiki** — no boxes-within-boxes, no sidebar chrome fighting prose, no link thickets in the reading column.
- **Don't** hardcode a color value in a component. The only sanctioned literals are the fixed semantic tokens (#ef4444, #16a34a, #dc2626).
- **Don't** use side-stripe accents (`border-left` > 1px) on cards, banners, or list items. The single exception is quote grammar: blockquotes and Obsidian-style callouts keep their 2px left rule.
- **Don't** put Playfair in buttons, labels, or data (The Playfair Threshold Rule).
- **Don't** add resting shadows, gradients, or glassmorphism — depth is hairline + tone (The Hairline Rule).
- **Don't** let Quiet Iris exceed ~10% of a screen (The One Voice Rule). If the accent is everywhere, nothing is primary.
