/**
 * db/seed-demo.ts — Comprehensive demo seed
 *
 * Exercises every user-visible feature of Principia Synthesia:
 *   - public vs private content (article-level and book-level visibility)
 *   - non-admin user grants (org-based and direct user grants)
 *   - all article statuses (draft, review, published, archived)
 *   - frontmatter features (tags, description, canvas)
 *   - MDX features (wikilinks, LaTeX math, <DynamicAnimation>, GFM)
 *   - revision history (3 revisions on newtons-laws)
 *   - internal articles (2 per book)
 *   - curriculum books (public: classical-physics, private: modern-physics)
 *   - KAO objects of every type (animation, dataset, mermaid diagram, graphviz diagram)
 *   - plugin badge on animations list (lorenz-attractor with source="plugin")
 *   - book snapshots (one per book)
 *   - per-user custom theme (viewer1 gets a Sepia variant)
 *
 * The seed is idempotent — every insert uses onConflictDoNothing() or an
 * existence check, so running it twice does not duplicate rows.
 *
 * MANUAL VERIFICATION CHECKLIST (run after seeding):
 *   [ ] Log in as admin → see all 4 statuses in article list
 *   [ ] Log in as viewer1 → can access secret-formula, cannot access modern-physics directly
 *   [ ] Log in as viewer2 → can access modern-physics (direct grant), cannot access secret-formula
 *   [ ] Logged-out → cannot access modern-physics or secret-formula
 *   [ ] /objects → shows all 9 objects grouped by type; lorenz-attractor has "Plugin" badge
 *   [ ] /admin/objects/plugins → shows lorenz-attractor as installed
 *   [ ] /curriculum/classical-physics → 7 entries (5 non-internal + 2 internal)
 *   [ ] /curriculum/modern-physics → 6 entries (4 non-internal + 2 internal)
 *   [ ] /admin/curriculum/classical-physics/snapshots → 1 snapshot with entries
 *   [ ] viewer1 logs in → sepia-tinted theme (light mode)
 */

import { db } from "./index";
import {
  users,
  articles,
  categories,
  articleCategories,
  revisions,
  curriculumEntries,
  objects,
  bookSnapshots,
  bookSnapshotEntries,
  organizations,
  orgMemberships,
  resourceVisibility,
  accessGrants,
  userThemes,
} from "./schema";
import type { ArticleMetadataShape } from "./schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { defaultDark } from "@/lib/theme";

// ── Internal article helper ────────────────────────────────────────────────────

async function seedInternalArticle(opts: {
  bookSlug: string;
  bookTitle: string;
  slug: string;
  title: string;
  content: string;
  metadata: ArticleMetadataShape;
  position: number;
  partTitle: string | null;
}) {
  // 1. upsert article
  await db.insert(articles).values({
    slug: opts.slug,
    title: opts.title,
    content: opts.content,
    metadata: opts.metadata,
    isInternal: true,
    parentBookSlug: opts.bookSlug,
  }).onConflictDoNothing();
  // 2. fetch its ID
  const [art] = await db.select().from(articles).where(eq(articles.slug, opts.slug));
  if (!art) return;
  // 3. upsert curriculum entry
  await db.insert(curriculumEntries).values({
    bookSlug: opts.bookSlug,
    bookTitle: opts.bookTitle,
    articleId: art.id,
    position: opts.position,
    partTitle: opts.partTitle,
  }).onConflictDoNothing();
}

// ── Main seed function ─────────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding database...\n");

  // ── 1. Users ─────────────────────────────────────────────────────────────────
  const adminEmail    = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const viewerEmail   = process.env.SEED_VIEWER_EMAIL;
  const viewerPassword = process.env.SEED_VIEWER_PASSWORD;

  if (adminEmail && adminPassword) {
    await db.insert(users).values({
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      isAdmin: true,
    }).onConflictDoNothing();
    console.log(`  Admin user seeded: ${adminEmail}`);
  } else {
    console.log("  Skipping admin user: SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD not set");
  }

  if (viewerEmail && viewerPassword) {
    await db.insert(users).values({
      email: viewerEmail,
      passwordHash: await bcrypt.hash(viewerPassword, 10),
      isAdmin: false,
    }).onConflictDoNothing();
    console.log(`  Viewer1 user seeded: ${viewerEmail}`);
  } else {
    console.log("  Skipping viewer1 user: SEED_VIEWER_EMAIL or SEED_VIEWER_PASSWORD not set");
  }

  // viewer2 — always seeded with a hardcoded password
  await db.insert(users).values({
    email: "viewer2@example.com",
    passwordHash: await bcrypt.hash("viewer-password-2", 10),
    isAdmin: false,
  }).onConflictDoNothing();
  console.log("  Viewer2 user seeded: viewer2@example.com");

  // Re-select all three users so we can reference their IDs downstream
  const [admin]   = adminEmail  ? await db.select().from(users).where(eq(users.email, adminEmail))  : [null];
  const [viewer1] = viewerEmail ? await db.select().from(users).where(eq(users.email, viewerEmail)) : [null];
  const [viewer2] = await db.select().from(users).where(eq(users.email, "viewer2@example.com"));
  console.log("  Users resolved");

  // ── 2. Categories ─────────────────────────────────────────────────────────────
  await db.insert(categories).values([
    { slug: "physics",          name: "Physics" },
    { slug: "mechanics",        name: "Classical Mechanics" },
    { slug: "electromagnetism", name: "Electromagnetism" },
    { slug: "relativity",       name: "Relativity" },
  ]).onConflictDoNothing();

  const allCategories = await db.select().from(categories);
  const catBySlug = Object.fromEntries(allCategories.map((c) => [c.slug, c]));
  console.log(`  Categories: ${allCategories.length} total`);

  // ── 3. Articles (non-internal) ────────────────────────────────────────────────
  await db.insert(articles).values([
    // ── 6.3.1 newtons-laws ──────────────────────────────────────────────────────
    {
      slug: "newtons-laws",
      title: "Newton's Laws of Motion",
      summary: "The three fundamental laws that govern the motion of objects in classical mechanics.",
      metadata: {
        status: "published",
        tags: ["mechanics", "classical-physics", "forces"],
        description: "Newton's three laws governing motion and forces in classical mechanics.",
        canvas: "pendulum",
      },
      content: `---
status: published
tags:
  - mechanics
  - classical-physics
  - forces
description: Newton's three laws governing motion and forces in classical mechanics.
canvas: pendulum
---

# Newton's Laws of Motion

## First Law (Law of Inertia)

An object at rest remains at rest, and an object in motion continues in motion at constant velocity, unless acted upon by a net external force.

## Second Law

The net force on an object equals the product of its mass and acceleration:

$$F = ma$$

## Third Law

For every action there is an equal and opposite reaction.`,
    },
    // ── 6.3.2 general-relativity ─────────────────────────────────────────────────
    {
      slug: "general-relativity",
      title: "General Relativity",
      summary: "Einstein's theory of gravitation, describing gravity as the curvature of spacetime.",
      metadata: {
        status: "published",
        tags: ["relativity", "gravity", "spacetime"],
        description: "Einstein's geometric theory of gravitation — gravity as curvature of spacetime.",
        canvas: null,
      },
      content: `---
status: published
tags:
  - relativity
  - gravity
  - spacetime
description: Einstein's geometric theory of gravitation — gravity as curvature of spacetime.
---

# General Relativity

General relativity is a geometric theory of gravitation published by Albert Einstein in 1915. It generalises [[newtons-laws|Newton's laws]] to large gravitational fields and high velocities.

The Einstein field equations relate spacetime curvature to the energy-momentum of matter:

$$G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}$$

See the [[book:modern-physics|Modern Physics curriculum]] for a structured reading list, or browse the [[object:newtonian-mechanics-flow|Newtonian mechanics diagram]] for a comparison.

## Key Predictions

- Gravitational lensing
- Gravitational waves
- Black holes
- Expansion of the universe`,
    },
    // ── 6.3.3 maxwells-equations ─────────────────────────────────────────────────
    {
      slug: "maxwells-equations",
      title: "Maxwell's Equations",
      summary: "The four fundamental equations of classical electromagnetism.",
      metadata: {
        status: "published",
        tags: ["electromagnetism", "classical-physics"],
        description: "The four fundamental equations describing electric and magnetic fields.",
        canvas: null,
      },
      content: `---
status: published
tags:
  - electromagnetism
  - classical-physics
description: The four fundamental equations describing electric and magnetic fields.
---

# Maxwell's Equations

Maxwell's equations describe how electric and magnetic fields are generated by charges and currents.

**Gauss's law for electricity:**
$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}$$

**Gauss's law for magnetism:**
$$\\nabla \\cdot \\mathbf{B} = 0$$

**Faraday's law:**
$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$

**Ampère–Maxwell law:**
$$\\nabla \\times \\mathbf{B} = \\mu_0 \\left( \\mathbf{J} + \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t} \\right)$$`,
    },
    // ── 6.3.4 wave-mechanics ─────────────────────────────────────────────────────
    {
      slug: "wave-mechanics",
      title: "Wave Mechanics",
      summary: "Wave superposition and interference, illustrated with a live animation.",
      metadata: {
        status: "published",
        tags: ["waves", "mechanics"],
        description: "Wave superposition and interference, illustrated with a live animation.",
        canvas: null,
      },
      content: `---
status: published
tags:
  - waves
  - mechanics
description: Wave superposition and interference, illustrated with a live animation.
---

# Wave Mechanics

When two waves overlap, their amplitudes add. For sinusoidal waves with the same frequency $\\omega$, the resultant amplitude depends on the phase difference $\\Delta\\phi$:

$$A_{\\text{result}} = 2A\\cos(\\Delta\\phi / 2)$$

The animation below shows two waves with different frequencies summing into a beat pattern.

<DynamicAnimation slug="wave-superposition" />

Inline math like $E = mc^2$ should render alongside block math without breaking.`,
    },
    // ── 6.3.5 quantum-mechanics (draft) ──────────────────────────────────────────
    {
      slug: "quantum-mechanics",
      title: "Quantum Mechanics (Draft)",
      summary: "Work-in-progress notes on the Schrödinger equation.",
      metadata: {
        status: "draft",
        tags: ["quantum", "modern-physics"],
        description: "Work-in-progress notes on the Schrödinger equation.",
        canvas: null,
      },
      content: `---
status: draft
tags:
  - quantum
  - modern-physics
description: Work-in-progress notes on the Schrödinger equation.
---

# Quantum Mechanics (Draft)

TODO: expand this section.

The time-dependent Schrödinger equation:

$$i\\hbar \\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi$$`,
    },
    // ── 6.3.6 thermodynamics-laws (review) ───────────────────────────────────────
    {
      slug: "thermodynamics-laws",
      title: "The Laws of Thermodynamics",
      summary: "The four laws of thermodynamics — awaiting peer review.",
      metadata: {
        status: "review",
        tags: ["thermodynamics", "classical-physics"],
        description: "The four laws of thermodynamics — awaiting peer review.",
        canvas: null,
      },
      content: `---
status: review
tags:
  - thermodynamics
  - classical-physics
description: The four laws of thermodynamics — awaiting peer review.
---

# The Laws of Thermodynamics

1. **Zeroth law** — thermal equilibrium is transitive.
2. **First law** — energy is conserved: $\\Delta U = Q - W$.
3. **Second law** — entropy of an isolated system never decreases.
4. **Third law** — entropy approaches a constant as $T \\to 0$.`,
    },
    // ── 6.3.7 aether-theory (archived) ───────────────────────────────────────────
    {
      slug: "aether-theory",
      title: "Luminiferous Aether",
      summary: "Historical interest only — superseded by special relativity.",
      metadata: {
        status: "archived",
        tags: ["history", "obsolete"],
        description: "Historical interest only — superseded by special relativity.",
        canvas: null,
      },
      content: `---
status: archived
tags:
  - history
  - obsolete
description: Historical interest only — superseded by special relativity.
---

# Luminiferous Aether

Before [[general-relativity|Einstein's relativity]], physicists hypothesised an "aether" medium for light. The Michelson–Morley experiment (1887) failed to detect motion through this medium, leading to its eventual abandonment.`,
    },
    // ── 6.3.8 secret-formula (published, but private) ────────────────────────────
    {
      slug: "secret-formula",
      title: "Secret Formula",
      summary: "Restricted content — only viewer1 has been granted access.",
      metadata: {
        status: "published",
        tags: ["secret", "internal"],
        description: "Restricted content — only viewer1 has been granted access.",
        canvas: null,
      },
      content: `---
status: published
tags:
  - secret
  - internal
description: Restricted content — only viewer1 has been granted access.
---

# Secret Formula

This article is **private**. If you can see it, you have an access grant.

$$\\Phi = \\oint \\mathbf{B} \\cdot d\\mathbf{A}$$`,
    },
    // ── 6.3.9 special-relativity (published, 2 categories) ───────────────────────
    {
      slug: "special-relativity",
      title: "Special Relativity",
      summary: "Einstein's 1905 theory of inertial frames.",
      metadata: {
        status: "published",
        tags: ["relativity", "modern-physics"],
        description: "Einstein's 1905 theory of inertial frames.",
        canvas: null,
      },
      content: `---
status: published
tags:
  - relativity
  - modern-physics
description: Einstein's 1905 theory of inertial frames.
---

# Special Relativity

The Lorentz factor $\\gamma$ governs time dilation and length contraction:

$$\\gamma = \\frac{1}{\\sqrt{1 - v^2/c^2}}$$

Mass-energy equivalence:

$$E^2 = (pc)^2 + (mc^2)^2$$

See also [[general-relativity]] for the generalisation to non-inertial frames.`,
    },
    // ── 6.3.10 orbital-dynamics ──────────────────────────────────────────────────
    {
      slug: "orbital-dynamics",
      title: "Orbital Dynamics",
      summary: "Kepler's laws and the two-body problem.",
      metadata: {
        status: "published",
        tags: ["mechanics", "astronomy"],
        description: "Kepler's laws and the two-body problem.",
        canvas: "orbital-mechanics",
      },
      content: `---
status: published
tags:
  - mechanics
  - astronomy
description: Kepler's laws and the two-body problem.
canvas: orbital-mechanics
---

# Orbital Dynamics

Kepler's third law relates the orbital period $T$ to the semi-major axis $a$:

$$T^2 = \\frac{4\\pi^2}{GM} a^3$$

This is a direct consequence of [[newtons-laws|Newton's second law]] applied to the inverse-square gravitational force.`,
    },
    // ── 6.3.11 spring-oscillator-notes ───────────────────────────────────────────
    {
      slug: "spring-oscillator-notes",
      title: "Simple Harmonic Motion",
      summary: "Notes on simple harmonic motion.",
      metadata: {
        status: "published",
        tags: ["mechanics", "oscillations"],
        description: "Notes on simple harmonic motion.",
        canvas: "spring-animation",
      },
      content: `---
status: published
tags:
  - mechanics
  - oscillations
description: Notes on simple harmonic motion.
canvas: spring-animation
---

# Simple Harmonic Motion

A mass on a spring obeys

$$m\\ddot{x} = -kx$$

with angular frequency $\\omega = \\sqrt{k/m}$.`,
    },
  ]).onConflictDoNothing();

  const allNonInternalArticles = await db
    .select()
    .from(articles)
    .where(eq(articles.isInternal, false));
  const artBySlug = Object.fromEntries(allNonInternalArticles.map((a) => [a.slug, a]));
  console.log(`  Articles (non-internal): ${allNonInternalArticles.length} total`);

  // ── 4. Article-categories ─────────────────────────────────────────────────────
  const categoryLinks: Array<[string, string]> = [
    ["newtons-laws",            "mechanics"],
    ["newtons-laws",            "physics"],           // multi-category demo
    ["general-relativity",      "physics"],
    ["general-relativity",      "relativity"],        // multi-category demo
    ["maxwells-equations",      "electromagnetism"],
    ["wave-mechanics",          "mechanics"],
    ["thermodynamics-laws",     "physics"],
    ["special-relativity",      "relativity"],
    ["special-relativity",      "physics"],           // multi-category demo
    ["orbital-dynamics",        "mechanics"],
    ["spring-oscillator-notes", "mechanics"],
    // draft, archived, and secret-formula are intentionally uncategorised
  ];

  for (const [artSlug, catSlug] of categoryLinks) {
    const art = artBySlug[artSlug];
    const cat = catBySlug[catSlug];
    if (art && cat) {
      const existing = await db
        .select()
        .from(articleCategories)
        .where(
          and(
            eq(articleCategories.articleId, art.id),
            eq(articleCategories.categoryId, cat.id),
          ),
        );
      if (existing.length === 0) {
        await db.insert(articleCategories).values({ articleId: art.id, categoryId: cat.id });
      }
    }
  }
  console.log("  Article categories linked");

  // ── 5. Revisions ─────────────────────────────────────────────────────────────
  const newtonArticle = artBySlug["newtons-laws"];
  if (newtonArticle) {
    const existingRevisions = await db
      .select()
      .from(revisions)
      .where(eq(revisions.articleId, newtonArticle.id));
    if (existingRevisions.length === 0) {
      await db.insert(revisions).values([
        {
          articleId: newtonArticle.id,
          content: "# Newton's Laws\n\nFirst draft.",
          editNote: "Initial draft",
        },
        {
          articleId: newtonArticle.id,
          content: `# Newton's Laws of Motion\n\n## First Law\n\nAn object at rest stays at rest.\n\n## Second Law\n\n$$F = ma$$`,
          editNote: "Added mathematical notation",
        },
        {
          articleId: newtonArticle.id,
          content: `# Newton's Laws of Motion\n\n## First Law (Law of Inertia)\n\nAn object at rest remains at rest...\n\n## Second Law\n\n$$F = ma$$\n\n## Third Law\n\nFor every action there is an equal and opposite reaction.`,
          editNote: "Polished prose and added Third Law detail",
        },
      ]);
    }
  }
  console.log("  Revisions created");

  // ── 6. Curriculum entries (non-internal) ─────────────────────────────────────
  const classicalBook = { bookSlug: "classical-physics", bookTitle: "Classical Physics" };
  const modernBook    = { bookSlug: "modern-physics",    bookTitle: "Modern Physics" };

  const curriculumData = [
    { ...classicalBook, slug: "newtons-laws",            position: 0, partTitle: "Part I: Mechanics" },
    { ...classicalBook, slug: "orbital-dynamics",        position: 1, partTitle: "Part I: Mechanics" },
    { ...classicalBook, slug: "spring-oscillator-notes", position: 2, partTitle: "Part I: Mechanics" },
    { ...classicalBook, slug: "maxwells-equations",      position: 3, partTitle: "Part II: Electromagnetism" },
    { ...classicalBook, slug: "thermodynamics-laws",     position: 4, partTitle: "Part III: Thermodynamics" },
    { ...modernBook,    slug: "special-relativity",      position: 0, partTitle: "Part I: Relativity" },
    { ...modernBook,    slug: "general-relativity",      position: 1, partTitle: "Part I: Relativity" },
    { ...modernBook,    slug: "quantum-mechanics",       position: 2, partTitle: "Part II: Quantum" },
  ];

  for (const entry of curriculumData) {
    const art = artBySlug[entry.slug];
    if (art) {
      await db.insert(curriculumEntries).values({
        bookSlug:  entry.bookSlug,
        bookTitle: entry.bookTitle,
        articleId: art.id,
        position:  entry.position,
        partTitle: entry.partTitle ?? null,
      }).onConflictDoNothing();
    }
  }
  console.log("  Curriculum books: classical-physics, modern-physics");

  // ── 7. Internal articles ──────────────────────────────────────────────────────
  // classical-physics internals (positions 5 and 6)
  await seedInternalArticle({
    bookSlug:  "classical-physics",
    bookTitle: "Classical Physics",
    slug:      "cp-preface",
    title:     "Classical Physics: Preface",
    position:  5,
    partTitle: null,
    metadata:  { status: "published", tags: [], description: "", canvas: null },
    content: `---
status: published
tags: []
description: ""
---

# Classical Physics: Preface

Welcome to this curated reading list covering the foundations of classical physics. These materials span Newtonian mechanics, electromagnetism, and thermodynamics. Work through the chapters in order for a coherent progression from first principles to the Maxwell equations.

No prior university-level physics is assumed, though comfort with calculus is helpful.`,
  });

  await seedInternalArticle({
    bookSlug:  "classical-physics",
    bookTitle: "Classical Physics",
    slug:      "cp-bibliography",
    title:     "Classical Physics: Bibliography",
    position:  6,
    partTitle: "Appendix",
    metadata:  { status: "published", tags: [], description: "", canvas: null },
    content: `---
status: published
tags: []
description: ""
---

# Classical Physics: Bibliography

- **Halliday, Resnick & Krane** — *Physics*, 5th ed. (2001). A thorough undergraduate survey.
- **Griffiths, David J.** — *Introduction to Electrodynamics*, 4th ed. (2013). The definitive undergraduate EM text.
- **Goldstein, Poole & Safko** — *Classical Mechanics*, 3rd ed. (2001). Graduate-level Lagrangian and Hamiltonian mechanics.`,
  });

  // modern-physics internals (positions 3 and 4)
  await seedInternalArticle({
    bookSlug:  "modern-physics",
    bookTitle: "Modern Physics",
    slug:      "mp-foreword",
    title:     "Modern Physics: Foreword",
    position:  3,
    partTitle: null,
    metadata:  { status: "published", tags: [], description: "", canvas: null },
    content: `---
status: published
tags: []
description: ""
---

# Modern Physics: Foreword

This book covers the two pillars of twentieth-century physics: relativity and quantum mechanics. Both theories demand a departure from the Newtonian intuitions built up in *Classical Physics*, so readers are encouraged to approach the material with fresh eyes.

We begin with special relativity, which resolves the tension between electrodynamics and Newtonian mechanics, before moving to general relativity and the quantum world. Each chapter includes worked examples and self-test problems.`,
  });

  await seedInternalArticle({
    bookSlug:  "modern-physics",
    bookTitle: "Modern Physics",
    slug:      "mp-glossary",
    title:     "Modern Physics: Glossary",
    position:  4,
    partTitle: "Appendix",
    metadata:  { status: "published", tags: [], description: "", canvas: null },
    content: `---
status: published
tags: []
description: ""
---

# Modern Physics: Glossary

**Spacetime** — The four-dimensional continuum combining three spatial dimensions with time, introduced by Minkowski in 1908.

**Quanta** — Discrete packets of energy; the concept introduced by Planck (1900) to explain blackbody radiation.

**Photon** — The quantum of electromagnetic radiation, first proposed by Einstein (1905) to explain the photoelectric effect.

**Wave function** — A complex-valued function $\\Psi(\\mathbf{r}, t)$ whose squared modulus gives the probability density for finding a particle at position $\\mathbf{r}$ at time $t$.`,
  });

  console.log("  Internal articles seeded (4 total: 2 per book)");

  // ── 8. KAO Objects ────────────────────────────────────────────────────────────
  await db.insert(objects).values([
    // ── Existing animations ──────────────────────────────────────────────────────
    {
      slug: "pendulum",
      name: "Simple Pendulum",
      type: "animation",
      description: null,
      content: {
        code: `function Pendulum() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 600;
  canvas.height = canvas.offsetHeight || 400;
  const W = canvas.width, H = canvas.height;
  const pivotX = W / 2, pivotY = H * 0.12;
  const L_px = H * 0.55;
  const L = 1.2;
  let angle = Math.PI / 3.5;
  let omega = 0;
  const g = 9.8, dt = 1 / 60;
  let trail = [];

  function tick() {
    const alpha = -(g / L) * Math.sin(angle);
    omega += alpha * dt;
    angle += omega * dt;
    const bobX = pivotX + L_px * Math.sin(angle);
    const bobY = pivotY + L_px * Math.cos(angle);
    trail.push({ x: bobX, y: bobY });
    if (trail.length > 40) trail.shift();

    ctx.fillStyle = window.theme.background;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < trail.length; i++) {
      ctx.beginPath();
      ctx.arc(trail[i].x, trail[i].y, 3 * (i / trail.length), 0, Math.PI * 2);
      ctx.fillStyle = window.theme.primaryBtn;
      ctx.globalAlpha = (i / trail.length) * 0.4;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bobX, bobY);
    ctx.strokeStyle = window.theme.muted;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
    ctx.fillStyle = window.theme.foreground;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(bobX, bobY, 20, 0, Math.PI * 2);
    ctx.fillStyle = window.theme.primaryBtn;
    ctx.fill();

    requestAnimationFrame(tick);
  }
  tick();
}`,
      },
    },
    {
      slug: "orbital-mechanics",
      name: "Orbital Mechanics",
      type: "animation",
      description: null,
      content: {
        code: `function OrbitalMechanics() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 600;
  canvas.height = canvas.offsetHeight || 400;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) * 0.5;
  let t = 0;

  const planets = [
    { rFrac: 0.24, speed: 0.04, size: 6 },
    { rFrac: 0.44, speed: 0.025, size: 9 },
    { rFrac: 0.68, speed: 0.015, size: 7 },
  ];

  function tick() {
    const colors = [window.theme.link, window.theme.primaryBtn, window.theme.linkHover];
    ctx.fillStyle = window.theme.background;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 36);
    glow.addColorStop(0, window.theme.link);
    glow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, 36, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    t += 1;
    planets.forEach(function(p, i) {
      const r = R * p.rFrac;
      const angle = t * p.speed;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = window.theme.border;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = colors[i];
      ctx.fill();
    });

    requestAnimationFrame(tick);
  }
  tick();
}`,
      },
    },
    {
      slug: "wave-superposition",
      name: "Wave Superposition",
      type: "animation",
      description: null,
      content: {
        code: `function WaveSuperposition() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 600;
  canvas.height = canvas.offsetHeight || 400;
  const W = canvas.width, H = canvas.height;
  let t = 0;

  const waves = [
    { freq: 0.02, amp: H * 0.13, speed: 0.05 },
    { freq: 0.033, amp: H * 0.09, speed: 0.03 },
  ];

  function drawWave(yBase, freq, amp, speed, color, alpha) {
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const y = yBase + amp * Math.sin(freq * x - speed * t);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function tick() {
    ctx.fillStyle = window.theme.background;
    ctx.fillRect(0, 0, W, H);

    drawWave(H * 0.35, waves[0].freq, waves[0].amp, waves[0].speed, window.theme.link, 0.6);
    drawWave(H * 0.65, waves[1].freq, waves[1].amp, waves[1].speed, window.theme.primaryBtn, 0.6);

    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      let y = H / 2;
      for (const w of waves) y += w.amp * Math.sin(w.freq * x - w.speed * t);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = window.theme.foreground;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    t += 1;
    requestAnimationFrame(tick);
  }
  tick();
}`,
      },
    },
    {
      slug: "spring-animation",
      name: "Spring Oscillator",
      type: "animation",
      description: "A mass-spring system demonstrating simple harmonic motion.",
      content: {
        code: `function SpringOscillator() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 600;
  canvas.height = canvas.offsetHeight || 400;
  const W = canvas.width, H = canvas.height;
  const anchorX = W / 2, anchorY = H * 0.15;
  const restLength = H * 0.35;
  const k = 0.008, mass = 1, damping = 0.995;
  let y = restLength, vy = 0;

  function drawSpring(x1, y1, x2, y2, coils) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const step = len / (coils * 2 + 2);
    const amplitude = 12;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i <= coils * 2 + 1; i++) {
      const t = i / (coils * 2 + 2);
      const mx = x1 + (x2 - x1) * t;
      const my = y1 + (y2 - y1) * t;
      const offset = (i % 2 === 0 ? 1 : -1) * amplitude;
      ctx.lineTo(mx + offset, my);
    }
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = window.theme.muted;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function tick() {
    const force = -k * (y - restLength);
    vy = (vy + force / mass) * damping;
    y += vy;

    ctx.fillStyle = window.theme.background;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = window.theme.border;
    ctx.fillRect(anchorX - 30, anchorY - 8, 60, 8);

    drawSpring(anchorX, anchorY, anchorX, anchorY + y, 8);

    ctx.beginPath();
    ctx.arc(anchorX, anchorY + y + 20, 20, 0, Math.PI * 2);
    ctx.fillStyle = window.theme.primaryBtn;
    ctx.fill();

    requestAnimationFrame(tick);
  }
  tick();
}`,
      },
    },
    // ── Existing dataset ─────────────────────────────────────────────────────────
    {
      slug: "periodic-table-sample",
      name: "Periodic Table Sample",
      type: "dataset",
      description: "A small subset of periodic table data for demonstration.",
      content: {
        headers: ["Element", "Symbol", "Atomic Number", "Atomic Mass (u)"],
        rows: [
          ["Hydrogen",  "H",  1,   1.008],
          ["Helium",    "He", 2,   4.003],
          ["Carbon",    "C",  6,  12.011],
          ["Nitrogen",  "N",  7,  14.007],
          ["Oxygen",    "O",  8,  15.999],
          ["Sodium",    "Na", 11, 22.990],
          ["Iron",      "Fe", 26, 55.845],
          ["Gold",      "Au", 79, 196.967],
        ],
      },
    },
    // ── Existing mermaid diagram ──────────────────────────────────────────────────
    {
      slug: "newtonian-mechanics-flow",
      name: "Newtonian Mechanics Flow",
      type: "diagram",
      description: "Causal flow from force to position via Newton's second law.",
      content: {
        format: "mermaid",
        source: `graph TD
  F[Force F] --> A["Acceleration a = F/m"]
  A --> V["Velocity v = ∫a dt"]
  V --> X["Position x = ∫v dt"]
  M[Mass m] --> A`,
      },
    },
    // ── New: graphviz diagram ────────────────────────────────────────────────────
    {
      slug: "force-diagram",
      name: "Free-Body Diagram (Graphviz)",
      type: "diagram",
      description: "A free-body diagram rendered with Graphviz DOT syntax.",
      content: {
        format: "graphviz",
        source: `digraph FreeBody {
  rankdir=TB;
  node [shape=circle, style=filled, fillcolor="white"];
  Mass [label="m"];
  edge [arrowhead=normal];
  Gravity [shape=plaintext, label="W = mg"];
  Normal  [shape=plaintext, label="N"];
  Friction[shape=plaintext, label="f"];
  Applied [shape=plaintext, label="F_app"];
  Gravity -> Mass;
  Normal  -> Mass;
  Friction-> Mass;
  Applied -> Mass;
}`,
      },
    },
    // ── New: plugin-flagged animation (lorenz-attractor) ─────────────────────────
    {
      slug: "lorenz-attractor",
      name: "Lorenz Attractor",
      type: "animation",
      description: "Classic Lorenz system — installed via the plugin registry.",
      source: "plugin",
      pluginMeta: {
        version: "1.0.0",
        description: "Classic chaotic attractor, projected to 2D.",
        author: "Demo Author",
        tags: ["chaos", "physics"],
        license: "MIT",
      },
      content: {
        code: `function Lorenz() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 600;
  canvas.height = canvas.offsetHeight || 400;
  const W = canvas.width, H = canvas.height;
  let x = 0.1, y = 0, z = 0;
  const sigma = 10, rho = 28, beta = 8/3, dt = 0.005;
  const trail = [];

  function tick() {
    for (let i = 0; i < 4; i++) {
      const dx = sigma * (y - x);
      const dy = x * (rho - z) - y;
      const dz = x * y - beta * z;
      x += dx * dt; y += dy * dt; z += dz * dt;
      trail.push({ x, z });
      if (trail.length > 4000) trail.shift();
    }
    ctx.fillStyle = window.theme.background;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = window.theme.primaryBtn;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < trail.length; i++) {
      const px = W/2 + trail[i].x * 12;
      const py = H/2 - (trail[i].z - 25) * 8;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    requestAnimationFrame(tick);
  }
  tick();
}`,
      },
    },
  ]).onConflictDoNothing();
  console.log("  KAO objects: 5 animations (1 plugin), 1 dataset, 2 diagrams");

  // ── 9. Book snapshots ─────────────────────────────────────────────────────────
  // classical-physics snapshot
  const classicalEntries = await db
    .select()
    .from(curriculumEntries)
    .where(eq(curriculumEntries.bookSlug, "classical-physics"));

  if (classicalEntries.length > 0) {
    const existingClassicalSnapshot = await db
      .select()
      .from(bookSnapshots)
      .where(eq(bookSnapshots.bookSlug, "classical-physics"));

    if (existingClassicalSnapshot.length === 0) {
      const [snap] = await db.insert(bookSnapshots).values({
        bookSlug:  "classical-physics",
        bookTitle: "Classical Physics",
        note:      "Initial seed snapshot",
      }).returning();

      for (const entry of classicalEntries) {
        // Look up by ID so internal articles are included
        const [art] = await db.select().from(articles).where(eq(articles.id, entry.articleId));
        if (art) {
          await db.insert(bookSnapshotEntries).values({
            snapshotId:     snap.id,
            articleId:      art.id,
            articleSlug:    art.slug,
            articleTitle:   art.title,
            articleContent: art.content,
            position:       entry.position,
            partTitle:      entry.partTitle ?? null,
          });
        }
      }
      console.log("  Book snapshot: classical-physics created");
    } else {
      console.log("  Book snapshot: classical-physics already exists, skipped");
    }
  }

  // modern-physics snapshot
  const modernEntries = await db
    .select()
    .from(curriculumEntries)
    .where(eq(curriculumEntries.bookSlug, "modern-physics"));

  if (modernEntries.length > 0) {
    const existingModernSnapshot = await db
      .select()
      .from(bookSnapshots)
      .where(eq(bookSnapshots.bookSlug, "modern-physics"));

    if (existingModernSnapshot.length === 0) {
      const [snap] = await db.insert(bookSnapshots).values({
        bookSlug:  "modern-physics",
        bookTitle: "Modern Physics",
        note:      "Initial seed snapshot",
      }).returning();

      for (const entry of modernEntries) {
        // Look up by ID so internal articles are included
        const [art] = await db.select().from(articles).where(eq(articles.id, entry.articleId));
        if (art) {
          await db.insert(bookSnapshotEntries).values({
            snapshotId:     snap.id,
            articleId:      art.id,
            articleSlug:    art.slug,
            articleTitle:   art.title,
            articleContent: art.content,
            position:       entry.position,
            partTitle:      entry.partTitle ?? null,
          });
        }
      }
      console.log("  Book snapshot: modern-physics created");
    } else {
      console.log("  Book snapshot: modern-physics already exists, skipped");
    }
  }

  // ── 10. Organizations ─────────────────────────────────────────────────────────
  await db.insert(organizations).values([
    { slug: "faculty",  name: "Faculty Members" },
    { slug: "students", name: "Students" },
  ]).onConflictDoNothing();

  const allOrgs   = await db.select().from(organizations);
  const orgBySlug = Object.fromEntries(allOrgs.map((o) => [o.slug, o]));
  const facultyOrg  = orgBySlug["faculty"];
  const studentsOrg = orgBySlug["students"];
  console.log(`  Organizations: ${allOrgs.length} total`);

  // ── 11. Org memberships ───────────────────────────────────────────────────────
  // faculty: admin (owner), viewer1 (member)
  if (facultyOrg && admin) {
    await db.insert(orgMemberships).values({
      orgId:  facultyOrg.id,
      userId: admin.id,
      role:   "owner",
    }).onConflictDoNothing();
  }
  if (facultyOrg && viewer1) {
    await db.insert(orgMemberships).values({
      orgId:  facultyOrg.id,
      userId: viewer1.id,
      role:   "member",
    }).onConflictDoNothing();
  }
  // students: viewer2 (member only — no owner intentionally)
  if (studentsOrg && viewer2) {
    await db.insert(orgMemberships).values({
      orgId:  studentsOrg.id,
      userId: viewer2.id,
      role:   "member",
    }).onConflictDoNothing();
  }
  console.log("  Org memberships: admin+viewer1 → faculty, viewer2 → students");

  // ── 12. Resource visibility ───────────────────────────────────────────────────
  await db.insert(resourceVisibility).values([
    { resourceType: "book",    resourceKey: "modern-physics", isPrivate: true },
    { resourceType: "article", resourceKey: "secret-formula", isPrivate: true },
  ]).onConflictDoNothing();
  console.log("  Resource visibility: modern-physics (book) + secret-formula (article) set private");

  // ── 13. Access grants ─────────────────────────────────────────────────────────
  // 1. faculty org → modern-physics book
  // 2. students org → modern-physics book
  // 3. viewer2 (direct user) → modern-physics book
  // 4. viewer1 (direct user) → secret-formula article
  const grants: Array<{
    resourceType: "book" | "article";
    resourceKey: string;
    granteeType: "user" | "org";
    granteeId: number;
  }> = [];

  if (facultyOrg)  grants.push({ resourceType: "book",    resourceKey: "modern-physics", granteeType: "org",  granteeId: facultyOrg.id });
  if (studentsOrg) grants.push({ resourceType: "book",    resourceKey: "modern-physics", granteeType: "org",  granteeId: studentsOrg.id });
  if (viewer2)     grants.push({ resourceType: "book",    resourceKey: "modern-physics", granteeType: "user", granteeId: viewer2.id });
  if (viewer1)     grants.push({ resourceType: "article", resourceKey: "secret-formula", granteeType: "user", granteeId: viewer1.id });

  for (const g of grants) {
    await db.insert(accessGrants).values({
      ...g,
      grantedBy: admin?.id ?? null,
    }).onConflictDoNothing();
  }
  console.log(`  Access grants: ${grants.length} grants inserted`);

  // ── 14. User themes ───────────────────────────────────────────────────────────
  if (viewer1) {
    await db.insert(userThemes).values({
      userId: viewer1.id,
      colorSchemePreference: "light",
      lightTokens: {
        background:        "#fff8ec",
        foreground:        "#2c2416",
        muted:             "#f0e8d8",
        mutedForeground:   "#8a7055",
        border:            "#ddd0b8",
        link:              "#a06a00",
        linkHover:         "#2c2416",
        codeBackground:    "#f0e8d8",
        surface:           "#fff8ec",
        surfaceHover:      "#f0e8d8",
        primaryBtn:        "#a06a00",
        primaryBtnText:    "#fff8ec",
        inputBorder:       "#ddd0b8",
        inputFocusBorder:  "#a06a00",
        secondaryText:     "#8a7055",
      },
      darkTokens: {
        // Reuse defaultDark verbatim so dark mode is unchanged
        ...defaultDark,
      },
    }).onConflictDoNothing();
    console.log("  User theme: viewer1 sepia variant seeded");
  }

  // ── Final summary ─────────────────────────────────────────────────────────────
  const adminEmail_   = adminEmail   ?? "(skipped)";
  const viewerEmail_  = viewerEmail  ?? "(skipped)";

  console.log("\nSeeding complete!");
  console.log(`  Admin:    ${adminEmail_}`);
  console.log(`  Viewer 1: ${viewerEmail_}`);
  console.log("  Viewer 2: viewer2@example.com / viewer-password-2");
  console.log("\nDemo content seeded:");
  console.log("  - Books: classical-physics (public), modern-physics (private)");
  console.log("  - Articles: 11 public + 4 internal (15 total)");
  console.log("  - Statuses: published, draft, review, archived");
  console.log("  - Private article: secret-formula (granted to viewer1)");
  console.log("  - Private book grants: faculty/students orgs + viewer2");
  console.log("  - Objects: 5 animations (1 plugin), 1 dataset, 2 diagrams (mermaid + graphviz)");
  console.log("  - Snapshots: classical-physics, modern-physics");
  console.log("  - Custom theme: viewer1 (sepia variant)");

  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
