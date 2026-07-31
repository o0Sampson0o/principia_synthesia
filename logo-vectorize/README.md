# Principia Synthesia — identity mark

`principia-p.svg` is the mark. Transparent, one file, 2 102 bytes, tight viewBox
`38.1 38.68 233.7 272.27` (aspect **0.8583**).

| file | what |
|---|---|
| `principia-p.svg` | **the mark** — ship this |
| `preview-2x.png` | 2× raster preview |
| `size-test.png` | 16 / 24 / 32 / 48 / 64 px on light, dark, sepia |
| `variants/` | the five colour directions compared, plus contact sheets |
| `iterations/` | the four vectorization passes; `iteration_04` is the faithful trace of the draft |
| `trace-fidelity.png` | source vs trace vs error heat map |

## How to use it

The bowl is `fill="currentColor"`, so it inherits `--foreground` and is correct on
light, dark and every user retheme (Sepia included) with no second file. The violet
ramp is fixed — it is the brand colour, and a brand colour that shifts per user theme
isn't one. Anywhere `color` resolves to Ink, the mark is right.

## Colour

| role | value |
|---|---|
| bowl | `currentColor` → `--foreground` (`#18181b` / `#fafafa`) |
| base gradient | `#3F4582` → `#7984DB`, 6 stops, 65.6° |
| sheen | `#C8D6FF`, radial, opacity 0.50 → 0 |
| arm ramp | `#49508B`, horizontal, opacity 0 → 0.995 |

The ramp is the original draft's gradient rotated in OKLCH to **hue 277°** — Quiet
Iris's own hue — with chroma doubled to 0.13. The draft measured 307° at chroma 0.065:
30° off the accent and three times less saturated, which read as a near-miss rather than
a deliberate second colour. Lightness structure and both overlays are unchanged from the
trace, so the draft's sheen survives intact.

**Contrast.** Bowl against every ground: 17.7:1 light, 17.5:1 dark. Gradient darkest stop
2.07:1 on `#151517` — below the 3:1 non-text floor, but WCAG 1.4.11 exempts logotypes,
and that stop sits directly beneath the near-white bowl, so the silhouette never breaks.
A dark-tuned ramp reaching 2.80:1 is kept at `variants/A-dark-tuned-alt.svg`; it differs
by a mean ΔRGB of 8.4, which did not justify a second source of truth.

## Geometry

Traced sub-pixel from the raster draft, not eyeballed: contours by linear un-mixing of
the three materials plus marching squares at the 50 % crossing; robust line fits to every
straight edge and tangency-constrained circle fits to every arc. Median residuals
0.05–0.17 px.

Structure: **one bowl glyph with a counter punched through, plus a shape drawn on top
that shares the bowl's left edge, baseline, bottom-left corner and stem.** The counter is
a hole through both.

```
vertical    x =  38.10  left edge (shared)
            x = 121.24  stem right = counter left
            x = 190.82  counter right = arm right
            x = 271.80  bowl extreme right
horizontal  y =  38.68  top
            y = 118.08  counter top = mark top edge
            y = 159.31  counter bottom = arm top
            y = 238.10  bowl bottom = arm bottom
            y = 310.95  baseline
bowl        circle centre (172.08, 138.39) r = 99.72
```

A true circle — the conic fit returned axes 100.69 / 99.56, tangent to `y=38.68`,
`y=238.10` and `x=271.80`.

Corner radii: the four large corners measured 44.15 / 45.05 / 45.17 / 45.60 — one nominal
radius the diffusion render smeared — **unified to 45.00**. Counter corners 22.70 (top
right) and 20.80 (bottom right); the 22.70 arc is the crispest fit in the whole trace at
0.056 px median residual, so the pair was kept rather than forced to a 20.61 semicircle.

Sharp corners: baseline bottom-left, the stem's top-right, and both armpits. Verified at
14–16× zoom; the apparent r≈3–5 there is antialiasing only.

## Gradients

Hue is constant across the mark; only value varies. Model families were compared
numerically rather than chosen: linear at scanned angles 5.60 rms · radial 5.60
(degenerates to linear) · separable f(x)+g(y) 6.92 · quadratic 6.64.

- **Base** — one linear gradient at 65.6° over the whole path.
- **Sheen** — the base is not a pure ramp; there is an elliptical highlight centred at
  (68.3, 249.9), aspect 1 : 1.334. It drops the residual **5.60 → 2.27 rms**. This is what
  makes the mark read glossy rather than flat; dropping it saves 61 bytes and costs 62 %
  more error.
- **Arm** — the arm's field has no y-dependence (slope −0.018/px) while the base is
  y-dominated, so it needs its own ramp. Applied as a darkening overlay whose opacity is
  **exactly 0 on the junction line**, so the seam is continuous by construction. Step in
  value across x 120 → 122 is −1.0 to −2.7, matching the source's −1.3 to −1.7.

All three layers were fit jointly (alternating de-composite / re-fit, 14 rounds):
overall rms 2.53, base 2.74, arm 1.73.

## Structure

4 drawn elements, 2 geometry definitions, 16 gradient stops.

```
defs   psBase   linearGradient  6 stops
       psSheen  radialGradient  5 stops
       psArm    linearGradient  5 stops
       m        path            the mark outline, defined once
body   path     currentColor, fill-rule="evenodd", bowl + counter subpath
       use ×3   m, filled with psBase / psSheen / psArm
```

One `<path id="m">` referenced three times, so the shading layers cannot drift out of
alignment. Stop counts were reduced by greedy knot insertion; the knee is sharp — 10/7/7
stops only moves trace RMSE 11.22 → 11.16, so the extra 40 stops bought nothing.

Layer count is minimal: the three cannot merge (linear at 65.6°, radial, linear at 0°).
The mark shares five features with the bowl — left edge, baseline, sharp bottom-left,
stem right edge, stem bottom-right corner — plus the counter outline. SVG has no
constraint system, so those numbers are necessarily repeated across the two `d` strings.
Clipping one to the other, and masking the counter through a group, were both tried and
rejected: roughly break-even on bytes, materially harder to edit in Figma/Illustrator.

## Not done

- `app/favicon.ico` is still Next.js's default triangle. The mark is not wired into the
  app anywhere — no favicon set, no nav component, no PWA icons, no OG image.
- The draft's subtle bevel (dark rim on the mark side, bright rim ~246 on the bowl side
  along their shared boundary) is not reproduced.
