/**
 * db/seed-demo.ts — Comprehensive demo seed for Principia Synthesia
 *
 * Creates:
 *   - 4 users (1 root admin + 3 demo users) with publisher slugs
 *   - 2 organizations with memberships covering all three roles (super_admin, admin, member)
 *   - 6 categories
 *   - 14 articles (published, draft, review, archived; public, org-visible, private)
 *     including 2 internal articles (isInternal=true, parentBookId set)
 *   - 3 books (1 admin-owned public, 1 admin-owned org-visible, 1 admin-owned private)
 *     with 4–5 chapters each plus internal chapters and cross-publisher chapters
 *     book-classical-physics has 2 cross-publisher chapters from dr-feynman (addExternalArticle feature)
 *   - 5 KAO objects (3 animations, 1 dataset, 1 diagram)
 *   - Revisions (3 revisions on one article)
 *   - Article views (shaping top-articles ranking)
 *   - Resource visibility (private article + org-visible book + private book)
 *   - Access grants (user grant on private article, org grant on private book)
 *   - User themes for admin and feynman
 *   - Book snapshot (1 snapshot with 3 entries for classical-physics book)
 *
 * Idempotent: every insert uses onConflictDoNothing() where a unique constraint
 * exists; tables without unique constraints are guarded by existence checks.
 *
 * Credentials:
 *   Admin:  SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars (skipped silently if unset)
 *   Viewer: SEED_VIEWER_EMAIL / SEED_VIEWER_PASSWORD env vars (skipped silently if unset)
 *   Demo users 3–4: non-sensitive fixed demo passwords (only for local/staging use)
 *
 * Wikilink format: [[publisher:articles:slug]], [[publisher:books:slug]],
 *                  [[publisher:objects:slug]] (three-segment, publisher-scoped)
 */

import { createHash } from "crypto";
import { db } from "./index";
import {
  users,
  publishers,
  organizations,
  orgMemberships,
  articles,
  books,
  curriculumEntries,
  objects,
  categories,
  articleCategories,
  revisions,
  resourceVisibility,
  accessGrants,
  userThemes,
  articleViews,
  bookSnapshots,
  bookSnapshotEntries,
  events,
  eventArticles,
  articleSnapshots,
  notifications,
  articleCitations,
} from "./schema";
import type { ArticleMetadataShape } from "./schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { PRESETS } from "../lib/theme";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/** Returns a Date n days in the past. */
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

// ─── Seed entry point ─────────────────────────────────────────────────────────

async function seed() {
  console.log("[seed] Starting comprehensive demo seed...\n");

  // ── 1. Users ─────────────────────────────────────────────────────────────────
  console.log("[seed] Seeding users...");

  const adminEmail     = process.env.SEED_ADMIN_EMAIL;
  const adminPassword  = process.env.SEED_ADMIN_PASSWORD;
  const viewerEmail    = process.env.SEED_VIEWER_EMAIL;
  const viewerPassword = process.env.SEED_VIEWER_PASSWORD;

  // Root admin — credentials from env (skip silently if not set)
  if (adminEmail && adminPassword) {
    await db.insert(users).values({
      email:           adminEmail,
      passwordHash:    await hash(adminPassword),
      isRootAdmin:     true,
      displayName:     "Principia Admin",
      publisherSlug:   "principia-official",
      emailVerifiedAt: new Date(),
    }).onConflictDoNothing();
    console.log(`  admin: ${adminEmail} (principia-official)`);
  } else {
    console.log("  SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin user");
  }

  // Demo viewer — credentials from env (skip silently if not set)
  if (viewerEmail && viewerPassword) {
    await db.insert(users).values({
      email:           viewerEmail,
      passwordHash:    await hash(viewerPassword),
      isRootAdmin:     false,
      displayName:     "Dr. Feynman",
      publisherSlug:   "dr-feynman",
      emailVerifiedAt: new Date(),
    }).onConflictDoNothing();
    console.log(`  viewer: ${viewerEmail} (dr-feynman)`);
  } else {
    console.log("  SEED_VIEWER_EMAIL / SEED_VIEWER_PASSWORD not set — skipping viewer user");
  }

  // Demo user 3 — fixed non-sensitive demo password
  await db.insert(users).values({
    email:           "mit@example.com",
    passwordHash:    await hash("MitOcw-demo-2026!"),
    isRootAdmin:     false,
    displayName:     "MIT OCW",
    publisherSlug:   "mit-ocw",
    emailVerifiedAt: new Date(),
  }).onConflictDoNothing();

  // Demo user 4 — fixed non-sensitive demo password
  await db.insert(users).values({
    email:           "quantum@example.com",
    passwordHash:    await hash("QuantumLab-demo-2026!"),
    isRootAdmin:     false,
    displayName:     "Quantum Lab",
    publisherSlug:   "quantum-lab",
    emailVerifiedAt: new Date(),
  }).onConflictDoNothing();

  const adminRow    = adminEmail
    ? (await db.select().from(users).where(eq(users.email, adminEmail)))[0]
    : null;
  const feynmanRow  = viewerEmail
    ? (await db.select().from(users).where(eq(users.email, viewerEmail)))[0]
    : null;
  const [mitRow]    = await db.select().from(users).where(eq(users.email, "mit@example.com"));
  const [qLabRow]   = await db.select().from(users).where(eq(users.email, "quantum@example.com"));

  if (!adminRow) {
    console.log("[seed] No admin user available — most seeding will be skipped.");
    console.log("[seed] Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD and re-run.");
    process.exit(0);
  }

  if (mitRow)  console.log(`  mit-ocw:    mit@example.com  (id=${mitRow.id})`);
  if (qLabRow) console.log(`  quantum-lab: quantum@example.com  (id=${qLabRow.id})`);

  // ── 2. Publishers ─────────────────────────────────────────────────────────────
  console.log("[seed] Seeding publishers...");

  await db.insert(publishers).values({
    slug:   "principia-official",
    kind:   "user",
    userId: adminRow.id,
    orgId:  null,
  }).onConflictDoNothing();

  if (feynmanRow) {
    await db.insert(publishers).values({
      slug:   "dr-feynman",
      kind:   "user",
      userId: feynmanRow.id,
      orgId:  null,
    }).onConflictDoNothing();
  }

  if (mitRow) {
    await db.insert(publishers).values({
      slug:   "mit-ocw",
      kind:   "user",
      userId: mitRow.id,
      orgId:  null,
    }).onConflictDoNothing();
  }

  if (qLabRow) {
    await db.insert(publishers).values({
      slug:   "quantum-lab",
      kind:   "user",
      userId: qLabRow.id,
      orgId:  null,
    }).onConflictDoNothing();
  }

  console.log("  user publishers registered");

  // ── 3. Organizations ──────────────────────────────────────────────────────────
  console.log("[seed] Seeding organizations...");

  // Org 1: Faculty Consortium — exercises super_admin + admin + member roles
  await db.insert(organizations).values({
    slug:          "faculty",
    name:          "Faculty Consortium",
    publisherSlug: "faculty",
    creatorId:     adminRow.id,
  }).onConflictDoNothing();

  // Org 2: Quantum Institute — separate org; owns a private book
  await db.insert(organizations).values({
    slug:          "quantum-institute",
    name:          "Quantum Institute",
    publisherSlug: "quantum-institute",
    creatorId:     adminRow.id,
  }).onConflictDoNothing();

  const [facultyOrg]  = await db.select().from(organizations).where(eq(organizations.slug, "faculty"));
  const [quantumOrg]  = await db.select().from(organizations).where(eq(organizations.slug, "quantum-institute"));

  // Register org publishers
  if (facultyOrg) {
    await db.insert(publishers).values({
      slug:  "faculty",
      kind:  "org",
      orgId: facultyOrg.id,
    }).onConflictDoNothing();

    // Three distinct roles: super_admin (admin), admin (feynman), member (mitUser)
    await db.insert(orgMemberships).values({
      orgId:  facultyOrg.id,
      userId: adminRow.id,
      role:   "super_admin",
    }).onConflictDoNothing();

    if (feynmanRow) {
      await db.insert(orgMemberships).values({
        orgId:  facultyOrg.id,
        userId: feynmanRow.id,
        role:   "admin",
      }).onConflictDoNothing();
    }

    if (mitRow) {
      await db.insert(orgMemberships).values({
        orgId:  facultyOrg.id,
        userId: mitRow.id,
        role:   "member",
      }).onConflictDoNothing();
    }

    console.log("  org: faculty  (super_admin=admin, admin=dr-feynman, member=mit-ocw)");
  }

  if (quantumOrg) {
    await db.insert(publishers).values({
      slug:  "quantum-institute",
      kind:  "org",
      orgId: quantumOrg.id,
    }).onConflictDoNothing();

    // super_admin: qLabRow, member: feynmanRow
    if (qLabRow) {
      await db.insert(orgMemberships).values({
        orgId:  quantumOrg.id,
        userId: qLabRow.id,
        role:   "super_admin",
      }).onConflictDoNothing();
    }

    if (feynmanRow) {
      await db.insert(orgMemberships).values({
        orgId:  quantumOrg.id,
        userId: feynmanRow.id,
        role:   "member",
      }).onConflictDoNothing();
    }

    console.log("  org: quantum-institute  (super_admin=quantum-lab, member=dr-feynman)");
  }

  // ── 4. Categories ─────────────────────────────────────────────────────────────
  console.log("[seed] Seeding categories...");

  await db.insert(categories).values([
    { slug: "physics",          name: "Physics" },
    { slug: "mechanics",        name: "Classical Mechanics" },
    { slug: "electromagnetism", name: "Electromagnetism" },
    { slug: "relativity",       name: "Relativity" },
    { slug: "quantum",          name: "Quantum Mechanics" },
    { slug: "thermodynamics",   name: "Thermodynamics" },
  ]).onConflictDoNothing();

  const allCats    = await db.select().from(categories);
  const catBySlug  = Object.fromEntries(allCats.map((c) => [c.slug, c]));
  console.log(`  ${allCats.length} categories`);

  // ── 5. KAO Objects (must exist before articles that reference anim-pendulum) ─
  console.log("[seed] Seeding KAO objects...");

  const adminOwner = { ownerType: "user" as const, ownerId: adminRow.id };

  await db.insert(objects).values([
    // ── Animation 1: simple pendulum (admin-owned, referenced via `canvas` frontmatter)
    {
      slug:        "anim-pendulum",
      name:        "Simple Pendulum",
      type:        "animation",
      ...adminOwner,
      description: "A frictionless simple pendulum driven by gravity.",
      content: {
        code: `(function SimplePendulum() {
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 640;
  canvas.height = canvas.offsetHeight || 480;
  var W = canvas.width, H = canvas.height;
  var pivotX = W / 2, pivotY = H * 0.12;
  var L_px = H * 0.58;
  var angle = Math.PI / 3, omega = 0;
  var g = 9.81, L = 1.5, dt = 1 / 60;

  function step() {
    omega += -(g / L) * Math.sin(angle) * dt;
    angle  += omega * dt;

    var bobX = pivotX + L_px * Math.sin(angle);
    var bobY = pivotY + L_px * Math.cos(angle);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = (window.theme && window.theme.background) || '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Pivot
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
    ctx.fillStyle = (window.theme && window.theme.muted) || '#888';
    ctx.fill();

    // Rod
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bobX, bobY);
    ctx.strokeStyle = (window.theme && window.theme.foreground) || '#222';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Bob
    ctx.beginPath();
    ctx.arc(bobX, bobY, 20, 0, Math.PI * 2);
    ctx.fillStyle = (window.theme && window.theme.primaryBtn) || '#3b82f6';
    ctx.fill();
    ctx.strokeStyle = (window.theme && window.theme.border) || '#1d4ed8';
    ctx.lineWidth = 2;
    ctx.stroke();

    requestAnimationFrame(step);
  }
  step();
})();`,
      },
    },
    // ── Animation 2: Lissajous figures (admin-owned, second animation for variety)
    {
      slug:        "anim-lissajous",
      name:        "Lissajous Figures",
      type:        "animation",
      ...adminOwner,
      description: "Parametric curves traced by two orthogonal sinusoidal motions.",
      content: {
        code: `(function Lissajous() {
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 640;
  canvas.height = canvas.offsetHeight || 480;
  var W = canvas.width, H = canvas.height;
  var cx = W / 2, cy = H / 2;
  var A = Math.min(W, H) * 0.40;
  var a = 3, b = 2, delta = Math.PI / 4;
  var t = 0, trail = [];
  var MAX_TRAIL = 600;

  function step() {
    t += 0.018;
    var x = cx + A * Math.sin(a * t + delta);
    var y = cy + A * Math.sin(b * t);
    trail.push([x, y]);
    if (trail.length > MAX_TRAIL) trail.shift();

    ctx.fillStyle = (window.theme && window.theme.background) || '#09090b';
    ctx.fillRect(0, 0, W, H);

    if (trail.length < 2) { requestAnimationFrame(step); return; }
    ctx.beginPath();
    ctx.moveTo(trail[0][0], trail[0][1]);
    for (var i = 1; i < trail.length; i++) {
      ctx.lineTo(trail[i][0], trail[i][1]);
    }
    ctx.strokeStyle = (window.theme && window.theme.link) || '#88c0d0';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    requestAnimationFrame(step);
  }
  step();
})();`,
      },
    },
    // ── Dataset: periodic table subset (admin-owned)
    {
      slug:        "object-periodic-table",
      name:        "Periodic Table Sample",
      type:        "dataset",
      ...adminOwner,
      description: "Key elements from the first three rows of the periodic table.",
      content: {
        headers: ["Element", "Symbol", "Atomic Number", "Atomic Mass (u)", "Category"],
        rows: [
          ["Hydrogen",  "H",  1,   1.008,  "nonmetal"],
          ["Helium",    "He", 2,   4.003,  "noble gas"],
          ["Lithium",   "Li", 3,   6.941,  "alkali metal"],
          ["Carbon",    "C",  6,  12.011,  "nonmetal"],
          ["Nitrogen",  "N",  7,  14.007,  "nonmetal"],
          ["Oxygen",    "O",  8,  15.999,  "nonmetal"],
          ["Neon",      "Ne", 10, 20.180,  "noble gas"],
          ["Sodium",    "Na", 11, 22.990,  "alkali metal"],
        ],
      },
    },
    // ── Diagram: Newtonian force causal chain (admin-owned)
    {
      slug:        "object-newtonian-flow",
      name:        "Newtonian Mechanics Causal Chain",
      type:        "diagram",
      ...adminOwner,
      description: "Causal flow from applied force to resultant position.",
      content: {
        format: "mermaid",
        source: `graph TD
  F["Applied Force"] --> A["Acceleration (a=F/m)"]
  M["Mass (m)"] --> A
  A --> V["Velocity"]
  V0["Initial Velocity"] --> V
  V --> X["Position"]
  X0["Initial Position"] --> X`,
      },
    },
  ]).onConflictDoNothing();

  // ── Animation 3: wave superposition (org-owned by faculty — demonstrates org ownership)
  let orgAnimSeeded = false;
  if (facultyOrg) {
    await db.insert(objects).values({
      slug:        "anim-wave-superposition",
      name:        "Wave Superposition",
      type:        "animation",
      ownerType:   "org" as const,
      ownerId:     facultyOrg.id,
      description: "Two sinusoidal waves superposing to demonstrate interference.",
      content: {
        code: `(function WaveSuperposition() {
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 640;
  canvas.height = canvas.offsetHeight || 320;
  var W = canvas.width, H = canvas.height;
  var t = 0;
  var k1 = 2 * Math.PI / (W / 3), w1 = 1.5;
  var k2 = 2 * Math.PI / (W / 2), w2 = 1.0;

  function drawWave(k, w, color, yOff) {
    ctx.beginPath();
    for (var x = 0; x < W; x++) {
      var y = yOff + 40 * Math.sin(k * x - w * t);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function step() {
    ctx.fillStyle = (window.theme && window.theme.background) || '#fff';
    ctx.fillRect(0, 0, W, H);

    var col1 = (window.theme && window.theme.link) || '#5e81ac';
    var col2 = (window.theme && window.theme.primaryBtn) || '#88c0d0';
    var col3 = (window.theme && window.theme.foreground) || '#2e3440';

    drawWave(k1, w1, col1, H / 4);
    drawWave(k2, w2, col2, H / 2);

    ctx.beginPath();
    for (var x = 0; x < W; x++) {
      var y = (H * 3 / 4) + 30 * Math.sin(k1 * x - w1 * t) + 30 * Math.sin(k2 * x - w2 * t);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = col3;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    t += 0.04;
    requestAnimationFrame(step);
  }
  step();
})();`,
      },
    }).onConflictDoNothing();
    orgAnimSeeded = true;
  }

  const objCount = 4 + (orgAnimSeeded ? 1 : 0);
  console.log(`  ${objCount} KAO objects (2 admin animations, 1 org animation, 1 dataset, 1 diagram)`);

  // ── 6. Articles (admin-owned by principia-official) ───────────────────────────
  console.log("[seed] Seeding articles (principia-official)...");

  // Wikilink format: [[publisher:articles:slug]] [[publisher:books:slug]] [[publisher:objects:slug]]
  const articleDefs = [
    // ── published, public ──────────────────────────────────────────────────────
    {
      slug:    "article-newtons-laws",
      title:   "Newton's Laws of Motion",
      summary: "The three fundamental laws governing classical mechanics.",
      metadata: {
        status: "published",
        tags: ["mechanics", "classical-physics"],
        description: "Newton's three laws that describe the relationship between a body and the forces acting upon it.",
        canvas: null,
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["mechanics","classical-physics"]
description: "Newton's three laws that describe the relationship between a body and the forces acting upon it."
canvas: null
---

# Newton's Laws of Motion

## First Law — Law of Inertia

An object at rest remains at rest, and an object in motion continues in motion at constant velocity, unless acted upon by a net external force.

$$
\\vec{p} = m\\vec{v} = \\text{const} \\quad \\text{when} \\quad \\vec{F}_{\\text{net}} = 0
$$

## Second Law

The net force on an object equals the rate of change of its momentum:

$$
\\vec{F} = m\\vec{a}
$$

For variable mass systems (e.g. rockets), the full form is $\\vec{F} = \\frac{d(m\\vec{v})}{dt}$.

## Third Law

For every action there is an equal and opposite reaction:

$$
\\vec{F}_{AB} = -\\vec{F}_{BA}
$$

See also: [[principia-official:articles:article-general-relativity]] for the relativistic extension.

The Newtonian causal chain is visualised in [[principia-official:objects:object-newtonian-flow]].

<Cite slug="principia-official/article-general-relativity" />
<Cite slug="principia-official/article-maxwells-equations" />`,
    },
    {
      slug:    "article-general-relativity",
      title:   "General Relativity",
      summary: "Einstein's geometric theory of gravitation.",
      metadata: {
        status: "published",
        tags: ["relativity", "gravity", "einstein"],
        description: "Einstein's field equations and the curvature of spacetime.",
        canvas: null,
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["relativity","gravity","einstein"]
description: "Einstein's field equations and the curvature of spacetime."
canvas: null
---

# General Relativity

## Einstein Field Equations

The curvature of spacetime is related to the energy and momentum of matter:

$$
G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}
$$

where $G_{\\mu\\nu}$ is the Einstein tensor, $\\Lambda$ the cosmological constant, and $T_{\\mu\\nu}$ the stress-energy tensor.

## Geodesics

Free-falling particles follow geodesics — paths of extremal proper time:

$$
\\frac{d^2 x^\\mu}{d\\tau^2} + \\Gamma^\\mu_{\\alpha\\beta} \\frac{dx^\\alpha}{d\\tau}\\frac{dx^\\beta}{d\\tau} = 0
$$

## Schwarzschild Metric

For a spherically symmetric, non-rotating mass $M$:

$$
ds^2 = -\\left(1 - \\frac{r_s}{r}\\right)c^2\\,dt^2 + \\left(1 - \\frac{r_s}{r}\\right)^{-1}dr^2 + r^2 d\\Omega^2
$$

where $r_s = 2GM/c^2$ is the Schwarzschild radius.

Back to classical mechanics: [[principia-official:articles:article-newtons-laws]].`,
    },
    {
      slug:    "article-maxwells-equations",
      title:   "Maxwell's Equations",
      summary: "The four fundamental equations of classical electromagnetism.",
      metadata: {
        status: "published",
        tags: ["electromagnetism", "waves"],
        description: "Gauss, Faraday, Ampere — the complete classical field theory of electromagnetism.",
        canvas: null,
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["electromagnetism","waves"]
description: "Gauss, Faraday, Ampere — the complete classical field theory of electromagnetism."
canvas: null
---

# Maxwell's Equations

## Differential Form

| Equation | Expression |
|----------|------------|
| Gauss (electric) | $\\nabla \\cdot \\mathbf{E} = \\rho/\\varepsilon_0$ |
| Gauss (magnetic) | $\\nabla \\cdot \\mathbf{B} = 0$ |
| Faraday | $\\nabla \\times \\mathbf{E} = -\\partial\\mathbf{B}/\\partial t$ |
| Ampere-Maxwell | $\\nabla \\times \\mathbf{B} = \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\,\\partial\\mathbf{E}/\\partial t$ |

## Electromagnetic Waves

In vacuum ($\\rho=0$, $\\mathbf{J}=0$) the equations reduce to the wave equation:

$$
\\nabla^2\\mathbf{E} - \\mu_0\\varepsilon_0 \\frac{\\partial^2 \\mathbf{E}}{\\partial t^2} = 0
$$

with wave speed $c = 1/\\sqrt{\\mu_0\\varepsilon_0} \\approx 3\\times 10^8\\,\\text{m/s}$.

Related curriculum: [[principia-official:books:book-classical-physics]].`,
    },
    {
      slug:    "article-thermodynamics-laws",
      title:   "Laws of Thermodynamics",
      summary: "The zeroth through third laws governing heat, energy, and entropy.",
      metadata: {
        status: "published",
        tags: ["thermodynamics", "entropy", "heat"],
        description: "A concise treatment of all four thermodynamic laws with key equations.",
        canvas: null,
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["thermodynamics","entropy","heat"]
description: "A concise treatment of all four thermodynamic laws with key equations."
canvas: null
---

# Laws of Thermodynamics

## Zeroth Law

If two systems are each in thermal equilibrium with a third, they are in thermal equilibrium with each other. This defines **temperature**.

## First Law — Energy Conservation

$$
\\Delta U = Q - W
$$

The change in internal energy equals heat added minus work done by the system.

## Second Law — Entropy

In any spontaneous process the total entropy of an isolated system does not decrease:

$$
\\Delta S_{\\text{universe}} \\geq 0
$$

The Clausius inequality: $dS \\geq \\delta Q / T$.

## Third Law

As temperature approaches absolute zero, the entropy of a perfect crystal approaches zero:

$$
\\lim_{T \\to 0} S = 0
$$`,
    },
    // Article with `canvas` frontmatter — embeds anim-pendulum at page top
    {
      slug:    "article-special-relativity",
      title:   "Special Relativity",
      summary: "Time dilation, length contraction, and mass-energy equivalence.",
      metadata: {
        status: "published",
        tags: ["relativity", "einstein", "spacetime"],
        description: "Einstein's 1905 postulates and their consequences: time dilation, length contraction, E=mc^2.",
        canvas: "anim-pendulum",
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["relativity","einstein","spacetime"]
description: "Einstein's 1905 postulates and their consequences: time dilation, length contraction, E=mc^2."
canvas: "anim-pendulum"
---

# Special Relativity

## The Two Postulates

1. The laws of physics are the same in all inertial reference frames.
2. The speed of light in vacuum is $c \\approx 3\\times 10^8\\,\\text{m/s}$ for all observers.

## Lorentz Factor

$$
\\gamma = \\frac{1}{\\sqrt{1 - v^2/c^2}}
$$

## Time Dilation and Length Contraction

$$
\\Delta t' = \\gamma\\,\\Delta t \\qquad L' = L/\\gamma
$$

## Mass-Energy Equivalence

$$
E = mc^2 \\qquad E^2 = (pc)^2 + (mc^2)^2
$$

See also [[principia-official:articles:article-general-relativity]] for the curved-spacetime extension.

The pendulum animation above demonstrates classical mechanics intuition before we break it with relativity.`,
    },
    // ── draft ─────────────────────────────────────────────────────────────────
    {
      slug:    "article-quantum-mechanics-draft",
      title:   "Quantum Mechanics (Draft)",
      summary: "Work-in-progress on wave mechanics and the Schrodinger equation.",
      metadata: {
        status: "draft",
        tags: ["quantum", "wip"],
        description: "Incomplete draft covering wave functions, operators, and measurement.",
        canvas: null,
      } satisfies ArticleMetadataShape,
      content: `---
status: draft
tags: ["quantum","wip"]
description: "Incomplete draft covering wave functions, operators, and measurement."
canvas: null
---

# Quantum Mechanics (Draft)

## Wave Function

The quantum state of a particle is described by a wave function $\\Psi(x,t)$. The probability of finding the particle between $x$ and $x+dx$ is $|\\Psi|^2\\,dx$.

## Schrodinger Equation

$$
i\\hbar \\frac{\\partial\\Psi}{\\partial t} = \\hat{H}\\Psi
$$

**TODO:** expand on eigenvalues, measurement postulate, and commutator relations.`,
    },
    // ── review ────────────────────────────────────────────────────────────────
    {
      slug:    "article-statistical-mechanics",
      title:   "Statistical Mechanics",
      summary: "Bridge between microscopic dynamics and macroscopic thermodynamics.",
      metadata: {
        status: "review",
        tags: ["thermodynamics", "statistical"],
        description: "Boltzmann distribution, partition functions, and entropy from a statistical viewpoint.",
        canvas: null,
      } satisfies ArticleMetadataShape,
      content: `---
status: review
tags: ["thermodynamics","statistical"]
description: "Boltzmann distribution, partition functions, and entropy from a statistical viewpoint."
canvas: null
---

# Statistical Mechanics

## Boltzmann Distribution

The probability of a microstate with energy $E_i$ at temperature $T$:

$$
P_i = \\frac{e^{-E_i/k_BT}}{Z}, \\quad Z = \\sum_i e^{-E_i/k_BT}
$$

## Entropy

Boltzmann's famous relation:

$$
S = k_B \\ln \\Omega
$$

where $\\Omega$ is the number of accessible microstates.`,
    },
    // ── archived ──────────────────────────────────────────────────────────────
    {
      slug:    "article-aether-theory",
      title:   "Luminiferous Aether (Archived)",
      summary: "The now-disproved hypothesis of a medium for light propagation.",
      metadata: {
        status: "archived",
        tags: ["history", "disproved"],
        description: "Historical account of the aether hypothesis and its refutation by Michelson-Morley.",
        canvas: null,
      } satisfies ArticleMetadataShape,
      content: `---
status: archived
tags: ["history","disproved"]
description: "Historical account of the aether hypothesis and its refutation by Michelson-Morley."
canvas: null
---

# Luminiferous Aether (Archived)

This article has been archived. The aether theory was conclusively disproved by the Michelson-Morley experiment (1887) and superseded by special relativity.

## Historical Significance

The null result of the Michelson-Morley experiment was instrumental in motivating Einstein's 1905 postulates. For the modern successor, see [[principia-official:articles:article-special-relativity]].`,
    },
    // ── private article (explicit user grant required) ────────────────────────
    {
      slug:    "article-secret-formula",
      title:   "Secret Formula",
      summary: "Restricted content — private article visible only to granted users.",
      metadata: {
        status: "published",
        tags: ["restricted"],
        description: "Private content for authorized users only.",
        canvas: null,
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["restricted"]
description: "Private content for authorized users only."
canvas: null
---

# Secret Formula

This article is **private** and only visible to explicitly granted users.

$$
\\Phi = \\oint_S \\mathbf{B} \\cdot d\\mathbf{A} = \\mu_0 I_{\\text{enc}}
$$

The Lissajous animation: [[principia-official:objects:anim-lissajous]].`,
    },
  ];

  await db.insert(articles).values(
    articleDefs.map((a) => ({ ...a, ...adminOwner }))
  ).onConflictDoNothing();

  // Fetch admin articles for FK lookups below
  const adminArticles = await db
    .select()
    .from(articles)
    .where(and(eq(articles.ownerType, "user"), eq(articles.ownerId, adminRow.id)));
  const artBySlug = Object.fromEntries(adminArticles.map((a) => [a.slug, a]));
  console.log(`  ${adminArticles.length} articles seeded (principia-official)`);

  // ── Articles owned by dr-feynman ──────────────────────────────────────────
  if (feynmanRow) {
    const feynmanDefs = [
      {
        slug:    "article-feynman-path-integral",
        title:   "Feynman Path Integrals",
        summary: "The sum-over-histories formulation of quantum mechanics.",
        metadata: {
          status: "published",
          tags: ["quantum", "path-integral"],
          description: "Feynman's sum-over-paths approach: every path contributes with amplitude e^(iS/hbar).",
          canvas: null,
        } satisfies ArticleMetadataShape,
        content: `---
status: published
tags: ["quantum","path-integral"]
description: "Feynman's sum-over-paths approach."
canvas: null
---

# Feynman Path Integrals

## The Propagator

$$
K(x_f, t_f; x_i, t_i) = \\int \\mathcal{D}[x(t)]\\, e^{iS[x]/\\hbar}
$$

Every path from $(x_i, t_i)$ to $(x_f, t_f)$ contributes. Classical paths dominate because nearby paths interfere constructively when $\\delta S = 0$.

## Connection to the Schrodinger Equation

The path-integral and operator formulations are equivalent — both reproduce $i\\hbar\\,\\partial_t\\Psi = \\hat{H}\\Psi$.

See also [[dr-feynman:articles:article-qed-overview]].`,
        ownerType: "user" as const,
        ownerId: feynmanRow.id,
      },
      {
        slug:    "article-qed-overview",
        title:   "Quantum Electrodynamics",
        summary: "The quantum field theory of light and matter.",
        metadata: {
          status: "published",
          tags: ["quantum", "qed", "field-theory"],
          description: "QED: Feynman diagrams, renormalization, and the anomalous magnetic moment.",
          canvas: null,
        } satisfies ArticleMetadataShape,
        content: `---
status: published
tags: ["quantum","qed","field-theory"]
description: "QED: Feynman diagrams, renormalization, and the anomalous magnetic moment."
canvas: null
---

# Quantum Electrodynamics

## Lagrangian

$$
\\mathcal{L} = \\bar{\\psi}(i\\gamma^\\mu D_\\mu - m)\\psi - \\frac{1}{4}F_{\\mu\\nu}F^{\\mu\\nu}
$$

## Fine Structure Constant

$$
\\alpha = \\frac{e^2}{4\\pi\\varepsilon_0 \\hbar c} \\approx \\frac{1}{137}
$$

The anomalous magnetic moment $g-2$ is the most precisely tested prediction in physics.

Back to path integrals: [[dr-feynman:articles:article-feynman-path-integral]].`,
        ownerType: "user" as const,
        ownerId: feynmanRow.id,
      },
    ];

    await db.insert(articles).values(feynmanDefs).onConflictDoNothing();
    console.log("  2 articles seeded (dr-feynman)");
  }

  // ── Articles owned by faculty org ─────────────────────────────────────────
  if (facultyOrg) {
    const facultyDefs = [
      {
        slug:    "article-wave-optics",
        title:   "Wave Optics",
        summary: "Diffraction, interference, and the wave nature of light.",
        metadata: {
          status: "published",
          tags: ["optics", "waves", "electromagnetism"],
          description: "Young's double-slit, single-slit diffraction, and the diffraction limit.",
          canvas: null,
        } satisfies ArticleMetadataShape,
        content: `---
status: published
tags: ["optics","waves","electromagnetism"]
description: "Young's double-slit, single-slit diffraction, and the diffraction limit."
canvas: null
---

# Wave Optics

## Double-Slit Interference

$$
I(\\theta) = I_0 \\cos^2\\left(\\frac{\\pi d \\sin\\theta}{\\lambda}\\right)
$$

Bright fringes at $d\\sin\\theta = m\\lambda$, $m \\in \\mathbb{Z}$.

## Single-Slit Diffraction

$$
I(\\theta) = I_0 \\left(\\frac{\\sin\\beta}{\\beta}\\right)^2, \\quad \\beta = \\frac{\\pi a \\sin\\theta}{\\lambda}
$$

See the wave superposition animation: [[faculty:objects:anim-wave-superposition]].`,
        ownerType: "org" as const,
        ownerId: facultyOrg.id,
      },
    ];

    await db.insert(articles).values(facultyDefs).onConflictDoNothing();
    console.log("  1 article seeded (faculty org)");
  }

  // Refresh full article map after all inserts
  const allArticles   = await db.select().from(articles);
  const allArtBySlug  = Object.fromEntries(allArticles.map((a) => [a.slug, a]));

  // ── 7. Article categories ─────────────────────────────────────────────────────
  console.log("[seed] Seeding article categories...");

  // articleCategories has no unique constraint — guard by checking existence first
  const existingCatLinks = await db.select().from(articleCategories);
  const catLinkSet = new Set(existingCatLinks.map((l) => `${l.articleId}:${l.categoryId}`));

  const categoryLinks: Array<[string, string]> = [
    ["article-newtons-laws",            "mechanics"],
    ["article-newtons-laws",            "physics"],
    ["article-general-relativity",      "physics"],
    ["article-general-relativity",      "relativity"],
    ["article-maxwells-equations",      "electromagnetism"],
    ["article-maxwells-equations",      "physics"],
    ["article-thermodynamics-laws",     "thermodynamics"],
    ["article-thermodynamics-laws",     "physics"],
    ["article-special-relativity",      "relativity"],
    ["article-special-relativity",      "physics"],
    ["article-statistical-mechanics",   "thermodynamics"],
    ["article-quantum-mechanics-draft", "quantum"],
    ["article-feynman-path-integral",   "quantum"],
    ["article-qed-overview",            "quantum"],
    ["article-wave-optics",             "electromagnetism"],
  ];

  let newLinks = 0;
  for (const [artSlug, catSlug] of categoryLinks) {
    const art = allArtBySlug[artSlug];
    const cat = catBySlug[catSlug];
    if (art && cat) {
      const key = `${art.id}:${cat.id}`;
      if (!catLinkSet.has(key)) {
        await db.insert(articleCategories).values({ articleId: art.id, categoryId: cat.id });
        catLinkSet.add(key);
        newLinks++;
      }
    }
  }
  console.log(`  ${newLinks} new category links inserted (${categoryLinks.length} desired)`);

  // ── 8. Revisions (for article-newtons-laws) ────────────────────────────────
  console.log("[seed] Seeding revisions...");

  const newtonsArt = artBySlug["article-newtons-laws"];
  if (newtonsArt) {
    const existingRevs = await db
      .select()
      .from(revisions)
      .where(eq(revisions.articleId, newtonsArt.id));

    if (existingRevs.length === 0) {
      await db.insert(revisions).values([
        {
          articleId: newtonsArt.id,
          content: "# Newton's Laws\n\nFirst draft — placeholder.",
          editNote: "Initial draft",
          editedAt: daysAgo(14),
        },
        {
          articleId: newtonsArt.id,
          content: "# Newton's Laws of Motion\n\n## First Law\n\nAn object at rest stays at rest.\n\n$$\nF = ma\n$$",
          editNote: "Added math and sections",
          editedAt: daysAgo(7),
        },
        {
          articleId: newtonsArt.id,
          content: "# Newton's Laws of Motion\n\n## First Law (Law of Inertia)\n\nAn object at rest remains at rest.\n\n## Second Law\n\n$$\n\\vec{F} = m\\vec{a}\n$$\n\n## Third Law\n\nAction = -Reaction.",
          editNote: "Third law added",
          editedAt: daysAgo(2),
        },
      ]);
      console.log("  3 revisions created for article-newtons-laws");
    } else {
      console.log("  revisions already exist — skipped");
    }
  }

  // ── 9. Books ──────────────────────────────────────────────────────────────────
  console.log("[seed] Seeding books...");

  // Book 1: Classical Physics (admin-owned, public)
  await db.insert(books).values({
    slug:      "book-classical-physics",
    title:     "Classical Physics",
    ...adminOwner,
  }).onConflictDoNothing();

  // Book 2: Quantum Primer (admin-owned, org-visible — only faculty members see it)
  await db.insert(books).values({
    slug:      "book-quantum-primer",
    title:     "Quantum Primer",
    ...adminOwner,
  }).onConflictDoNothing();

  // Book 3: Advanced Topics (admin-owned, private — only via explicit grant)
  await db.insert(books).values({
    slug:      "book-advanced-topics",
    title:     "Advanced Topics in Physics",
    ...adminOwner,
  }).onConflictDoNothing();

  // Book 4: Faculty Lectures (org-owned by faculty, org-visible)
  if (facultyOrg) {
    await db.insert(books).values({
      slug:      "book-faculty-lectures",
      title:     "Faculty Lecture Series",
      ownerType: "org" as const,
      ownerId:   facultyOrg.id,
    }).onConflictDoNothing();
  }

  const [classicalBook] = await db
    .select().from(books)
    .where(and(eq(books.ownerType, "user"), eq(books.ownerId, adminRow.id), eq(books.slug, "book-classical-physics")));

  const [quantumBook] = await db
    .select().from(books)
    .where(and(eq(books.ownerType, "user"), eq(books.ownerId, adminRow.id), eq(books.slug, "book-quantum-primer")));

  const [advancedBook] = await db
    .select().from(books)
    .where(and(eq(books.ownerType, "user"), eq(books.ownerId, adminRow.id), eq(books.slug, "book-advanced-topics")));

  const facultyBook = facultyOrg
    ? (await db.select().from(books).where(and(
        eq(books.ownerType, "org"),
        eq(books.ownerId, facultyOrg.id),
        eq(books.slug, "book-faculty-lectures")
      )))[0]
    : null;

  // ── Book 1 regular chapters: Classical Physics ────────────────────────────
  if (classicalBook) {
    const ch1 = [
      { artSlug: "article-newtons-laws",        position: 0, partTitle: "Part I: Mechanics" },
      { artSlug: "article-thermodynamics-laws",  position: 1, partTitle: null },
      { artSlug: "article-special-relativity",   position: 2, partTitle: "Part II: Relativity" },
      { artSlug: "article-general-relativity",   position: 3, partTitle: null },
      { artSlug: "article-maxwells-equations",   position: 4, partTitle: "Part III: Electromagnetism" },
    ];

    for (const ch of ch1) {
      const art = artBySlug[ch.artSlug];
      if (art) {
        await db.insert(curriculumEntries).values({
          bookId:    classicalBook.id,
          articleId: art.id,
          position:  ch.position,
          partTitle: ch.partTitle,
        }).onConflictDoNothing();
      }
    }
    console.log("  book-classical-physics: 5 regular chapters");
  }

  // ── Book 1 internal articles (isInternal=true, parentBookId=classicalBook.id)
  //    Internal articles are created separately and do NOT appear on /:publisher/articles
  if (classicalBook) {
    const internalDefs = [
      {
        slug:         "article-classical-appendix-a",
        title:        "Appendix A: Mathematical Preliminaries",
        summary:      "Vector calculus and differential equations review — internal to Classical Physics.",
        isInternal:   true,
        parentBookId: classicalBook.id,
        metadata: {
          status: "published",
          tags: ["math", "appendix"],
          description: "Review of vector calculus and ODEs used throughout the book.",
          canvas: null,
        } satisfies ArticleMetadataShape,
        content: `---
status: published
tags: ["math","appendix"]
description: "Review of vector calculus and ODEs used throughout the book."
canvas: null
---

# Appendix A: Mathematical Preliminaries

This appendix is **internal** to the Classical Physics book and is not discoverable outside of it.

## Gradient, Divergence, Curl

$$
\\nabla f = \\left(\\frac{\\partial f}{\\partial x}, \\frac{\\partial f}{\\partial y}, \\frac{\\partial f}{\\partial z}\\right)
$$

$$
\\nabla \\cdot \\mathbf{F} = \\frac{\\partial F_x}{\\partial x} + \\frac{\\partial F_y}{\\partial y} + \\frac{\\partial F_z}{\\partial z}
$$

$$
\\nabla \\times \\mathbf{F} = \\begin{vmatrix} \\hat{i} & \\hat{j} & \\hat{k} \\\\ \\partial_x & \\partial_y & \\partial_z \\\\ F_x & F_y & F_z \\end{vmatrix}
$$

## First-Order ODEs

Separable form: $\\frac{dy}{dx} = f(x)g(y)$ integrates to $\\int \\frac{dy}{g(y)} = \\int f(x)\\,dx$.`,
        ...adminOwner,
      },
      {
        slug:         "article-classical-appendix-b",
        title:        "Appendix B: Units and Dimensional Analysis",
        summary:      "SI units, dimensional analysis, and order-of-magnitude estimation.",
        isInternal:   true,
        parentBookId: classicalBook.id,
        metadata: {
          status: "published",
          tags: ["units", "appendix"],
          description: "SI base units and dimensional analysis as a sanity-check tool.",
          canvas: null,
        } satisfies ArticleMetadataShape,
        content: `---
status: published
tags: ["units","appendix"]
description: "SI base units and dimensional analysis as a sanity-check tool."
canvas: null
---

# Appendix B: Units and Dimensional Analysis

This appendix is **internal** to the Classical Physics book.

## SI Base Units

| Quantity | Unit | Symbol |
|----------|------|--------|
| Length | metre | m |
| Mass | kilogram | kg |
| Time | second | s |
| Current | ampere | A |
| Temperature | kelvin | K |

## Dimensional Analysis

Every physically meaningful equation must be dimensionally consistent. For example, Newton's second law:

$$
[F] = [m][a] = \\text{kg}\\cdot\\text{m}\\cdot\\text{s}^{-2} = \\text{N}
$$`,
        ...adminOwner,
      },
    ];

    // Insert internal articles (onConflictDoNothing on (ownerType, ownerId, slug))
    await db.insert(articles).values(internalDefs).onConflictDoNothing();

    // Re-fetch to get their IDs
    const internalArticles = await db
      .select().from(articles)
      .where(and(
        eq(articles.ownerType, "user"),
        eq(articles.ownerId, adminRow.id),
        eq(articles.isInternal, true),
      ));
    const intBySlug = Object.fromEntries(internalArticles.map((a) => [a.slug, a]));

    // Each internal article must have a curriculumEntries row
    const internalEntries = [
      { artSlug: "article-classical-appendix-a", position: 5, partTitle: "Appendices" },
      { artSlug: "article-classical-appendix-b", position: 6, partTitle: null },
    ];

    for (const entry of internalEntries) {
      const art = intBySlug[entry.artSlug];
      if (art) {
        await db.insert(curriculumEntries).values({
          bookId:    classicalBook.id,
          articleId: art.id,
          position:  entry.position,
          partTitle: entry.partTitle,
        }).onConflictDoNothing();
      }
    }
    console.log("  book-classical-physics: 2 internal articles added (Appendix A, Appendix B)");
  }

  // ── Book 1 cross-publisher chapters (dr-feynman → book-classical-physics) ─
  //    These exercise the addExternalArticle feature:
  //      - article is owned by dr-feynman, not principia-official
  //      - article is public and non-internal (both requirements enforced by action)
  //      - no slug conflict with existing chapters
  //    Positions 7–8 follow monotonically after the internal appendices at 5–6.
  if (classicalBook && feynmanRow) {
    const feynmanArticles = await db
      .select()
      .from(articles)
      .where(and(eq(articles.ownerType, "user"), eq(articles.ownerId, feynmanRow.id)));
    const feynBySlug = Object.fromEntries(feynmanArticles.map((a) => [a.slug, a]));

    const crossPublisherChapters = [
      {
        artSlug:   "article-feynman-path-integral",
        position:  7,
        partTitle: "Part IV: Quantum Extensions",
      },
      {
        artSlug:   "article-qed-overview",
        position:  8,
        partTitle: null,
      },
    ];

    let crossCount = 0;
    for (const ch of crossPublisherChapters) {
      const art = feynBySlug[ch.artSlug];
      if (art) {
        await db.insert(curriculumEntries).values({
          bookId:    classicalBook.id,
          articleId: art.id,
          position:  ch.position,
          partTitle: ch.partTitle,
        }).onConflictDoNothing();
        crossCount++;
      }
    }
    console.log(
      `  book-classical-physics: ${crossCount} cross-publisher chapters added (dr-feynman → principia-official book)`
    );
  }

  // ── Book 2 chapters: Quantum Primer ──────────────────────────────────────
  if (quantumBook) {
    const ch2 = [
      { artSlug: "article-quantum-mechanics-draft", position: 0, partTitle: "Part I: Foundations" },
      { artSlug: "article-statistical-mechanics",   position: 1, partTitle: null },
    ];

    for (const ch of ch2) {
      const art = artBySlug[ch.artSlug];
      if (art) {
        await db.insert(curriculumEntries).values({
          bookId:    quantumBook.id,
          articleId: art.id,
          position:  ch.position,
          partTitle: ch.partTitle,
        }).onConflictDoNothing();
      }
    }

    // Also include feynman's articles as chapters (cross-publisher curriculum)
    if (feynmanRow) {
      const feynmanArticles = await db
        .select().from(articles)
        .where(and(eq(articles.ownerType, "user"), eq(articles.ownerId, feynmanRow.id)));
      const feynBySlug = Object.fromEntries(feynmanArticles.map((a) => [a.slug, a]));
      const feynmanChapters = [
        { artSlug: "article-feynman-path-integral", position: 2, partTitle: "Part II: Advanced Topics" },
        { artSlug: "article-qed-overview",          position: 3, partTitle: null },
      ];
      for (const ch of feynmanChapters) {
        const art = feynBySlug[ch.artSlug];
        if (art) {
          await db.insert(curriculumEntries).values({
            bookId:    quantumBook.id,
            articleId: art.id,
            position:  ch.position,
            partTitle: ch.partTitle,
          }).onConflictDoNothing();
        }
      }
    }
    console.log("  book-quantum-primer: 4 chapters");
  }

  // ── Book 3 chapters: Advanced Topics (private book) ────────────────────────
  if (advancedBook) {
    const ch3 = [
      { artSlug: "article-statistical-mechanics",   position: 0, partTitle: "Part I: Stat Mech" },
      { artSlug: "article-general-relativity",      position: 1, partTitle: "Part II: GR" },
      { artSlug: "article-maxwells-equations",      position: 2, partTitle: null },
    ];
    for (const ch of ch3) {
      const art = artBySlug[ch.artSlug];
      if (art) {
        await db.insert(curriculumEntries).values({
          bookId:    advancedBook.id,
          articleId: art.id,
          position:  ch.position,
          partTitle: ch.partTitle,
        }).onConflictDoNothing();
      }
    }
    console.log("  book-advanced-topics: 3 chapters (private book)");
  }

  // ── Book 4 chapters: Faculty Lectures ──────────────────────────────────────
  if (facultyBook && facultyOrg) {
    const facultyArticles = await db
      .select().from(articles)
      .where(and(eq(articles.ownerType, "org"), eq(articles.ownerId, facultyOrg.id)));
    const facBySlug = Object.fromEntries(facultyArticles.map((a) => [a.slug, a]));

    const ch4 = [
      { artSlug: "article-wave-optics",        position: 0, partTitle: "Lecture 1: Optics" },
      { artSlug: "article-maxwells-equations", position: 1, partTitle: null },
    ];

    for (const ch of ch4) {
      // article-wave-optics is org-owned; article-maxwells-equations is admin-owned
      const art = facBySlug[ch.artSlug] ?? artBySlug[ch.artSlug];
      if (art) {
        await db.insert(curriculumEntries).values({
          bookId:    facultyBook.id,
          articleId: art.id,
          position:  ch.position,
          partTitle: ch.partTitle,
        }).onConflictDoNothing();
      }
    }
    console.log("  book-faculty-lectures: 2 chapters");
  }

  // ── 10. Resource Visibility ───────────────────────────────────────────────────
  console.log("[seed] Seeding resource visibility...");

  // Private article: article-secret-formula (requires explicit user grant)
  const secretArt = artBySlug["article-secret-formula"];
  if (secretArt) {
    await db.insert(resourceVisibility).values({
      resourceType: "article",
      ...adminOwner,
      resourceKey:  "article-secret-formula",
      visibility:   "private",
    }).onConflictDoNothing();
    console.log("  article-secret-formula → private");
  }

  // Org-visible book: book-quantum-primer (faculty org members only)
  if (quantumBook) {
    await db.insert(resourceVisibility).values({
      resourceType: "book",
      ...adminOwner,
      resourceKey:  "book-quantum-primer",
      visibility:   "org",
    }).onConflictDoNothing();
    console.log("  book-quantum-primer → org");
  }

  // Private book: book-advanced-topics (requires explicit grant — even org not enough)
  if (advancedBook) {
    await db.insert(resourceVisibility).values({
      resourceType: "book",
      ...adminOwner,
      resourceKey:  "book-advanced-topics",
      visibility:   "private",
    }).onConflictDoNothing();
    console.log("  book-advanced-topics → private");
  }

  // Org-visible book: book-faculty-lectures (org-owned, org members only)
  if (facultyBook && facultyOrg) {
    await db.insert(resourceVisibility).values({
      resourceType: "book",
      ownerType:    "org",
      ownerId:      facultyOrg.id,
      resourceKey:  "book-faculty-lectures",
      visibility:   "org",
    }).onConflictDoNothing();
    console.log("  book-faculty-lectures → org");
  }

  // ── 11. Access Grants ─────────────────────────────────────────────────────────
  console.log("[seed] Seeding access grants...");

  // User grant: dr-feynman can read the private article
  if (secretArt && feynmanRow) {
    await db.insert(accessGrants).values({
      resourceType: "article",
      ...adminOwner,
      resourceKey:  "article-secret-formula",
      granteeType:  "user",
      granteeId:    feynmanRow.id,
      grantedBy:    adminRow.id,
    }).onConflictDoNothing();
    console.log("  grant: dr-feynman (user) → article-secret-formula");
  }

  // Org grant: quantum-institute org can read the private book
  if (advancedBook && quantumOrg) {
    await db.insert(accessGrants).values({
      resourceType: "book",
      ...adminOwner,
      resourceKey:  "book-advanced-topics",
      granteeType:  "org",
      granteeId:    quantumOrg.id,
      grantedBy:    adminRow.id,
    }).onConflictDoNothing();
    console.log("  grant: quantum-institute (org) → book-advanced-topics");
  }

  // NOTE: mit-ocw has NO grants to any private resource — access-denied path is testable.
  // NOTE: quantum-lab user has access to book-advanced-topics through quantum-institute org membership.

  // ── 12. Article Views ─────────────────────────────────────────────────────────
  console.log("[seed] Seeding article views...");

  // Guard with existence check — articleViews has no unique constraint
  const existingViews = await db.select().from(articleViews).limit(1);
  if (existingViews.length === 0) {
    const viewConfig: Array<[string, number]> = [
      ["article-newtons-laws",            22],
      ["article-general-relativity",      18],
      ["article-maxwells-equations",      14],
      ["article-special-relativity",      11],
      ["article-thermodynamics-laws",      9],
      ["article-statistical-mechanics",    6],
      ["article-quantum-mechanics-draft",  4],
      ["article-aether-theory",            2],
      ["article-feynman-path-integral",   16],
      ["article-qed-overview",            12],
    ];

    const viewRows: Array<{ articleId: number; viewedAt: Date }> = [];
    for (const [artSlug, count] of viewConfig) {
      const art = allArtBySlug[artSlug];
      if (!art) continue;
      for (let i = 0; i < count; i++) {
        const daysBack  = Math.floor(Math.random() * 28);
        const hoursBack = Math.floor(Math.random() * 24);
        viewRows.push({
          articleId: art.id,
          viewedAt:  new Date(Date.now() - daysBack * 86_400_000 - hoursBack * 3_600_000),
        });
      }
    }

    if (viewRows.length > 0) {
      await db.insert(articleViews).values(viewRows);
      console.log(`  ${viewRows.length} view events inserted`);
    }
  } else {
    console.log("  article_views already populated — skipped");
  }

  // ── 13. User Themes ───────────────────────────────────────────────────────────
  console.log("[seed] Seeding user themes...");

  const nordPreset     = PRESETS.find((p) => p.name === "Nord");
  const rosePinePreset = PRESETS.find((p) => p.name === "Rosé Pine");

  if (nordPreset) {
    await db.insert(userThemes).values({
      userId:                adminRow.id,
      lightTokens:           nordPreset.light,
      darkTokens:            nordPreset.dark,
      colorSchemePreference: "system",
    }).onConflictDoNothing();
    console.log("  admin user theme: Nord (system color scheme)");
  }

  if (rosePinePreset && feynmanRow) {
    await db.insert(userThemes).values({
      userId:                feynmanRow.id,
      lightTokens:           rosePinePreset.light,
      darkTokens:            rosePinePreset.dark,
      colorSchemePreference: "dark",
    }).onConflictDoNothing();
    console.log("  dr-feynman user theme: Rose Pine (dark color scheme)");
  }

  // ── 14. Book Snapshot ─────────────────────────────────────────────────────────
  console.log("[seed] Seeding book snapshot...");

  if (classicalBook) {
    const existingSnaps = await db
      .select().from(bookSnapshots)
      .where(eq(bookSnapshots.bookId, classicalBook.id))
      .limit(1);

    if (existingSnaps.length === 0) {
      const [snap] = await db.insert(bookSnapshots).values({
        bookId:    classicalBook.id,
        note:      "Initial snapshot — before chapter reorder",
        createdAt: daysAgo(5),
      }).returning();

      if (snap) {
        const snapEntries = [
          { artSlug: "article-newtons-laws",        position: 0, partTitle: "Part I: Mechanics" },
          { artSlug: "article-thermodynamics-laws", position: 1, partTitle: null },
          { artSlug: "article-special-relativity",  position: 2, partTitle: "Part II: Relativity" },
        ];

        for (const entry of snapEntries) {
          const art = artBySlug[entry.artSlug];
          if (art) {
            await db.insert(bookSnapshotEntries).values({
              snapshotId:     snap.id,
              articleId:      art.id,
              articleSlug:    art.slug,
              articleTitle:   art.title,
              articleContent: art.content ?? null,
              position:       entry.position,
              partTitle:      entry.partTitle,
            });
          }
        }
        console.log("  1 snapshot + 3 snapshot entries for book-classical-physics");
      }
    } else {
      console.log("  book snapshot already exists — skipped");
    }
  }

  // ── 15. Events ───────────────────────────────────────────────────────────────
  console.log("[seed] Seeding events...");

  // Events owned by principia-official (admin user)
  await db.insert(events).values([
    // Historical physics milestone — linked to article-newtons-laws
    {
      slug:        "event-principia-mathematica-1687",
      title:       "Publication of Principia Mathematica",
      description: "Isaac Newton's Philosophiæ Naturalis Principia Mathematica is published, laying the foundations of classical mechanics, gravitation, and the calculus of fluxions.",
      eventDate:   new Date("1687-07-05"),
      category:    "Physics History",
      isEraStart:  true,
      eraName:     "Classical Physics",
      ...adminOwner,
    },
    // Historical physics milestone — linked to article-maxwells-equations
    {
      slug:        "event-maxwells-treatise-1873",
      title:       "Maxwell's Treatise on Electricity and Magnetism",
      description: "James Clerk Maxwell publishes his two-volume Treatise on Electricity and Magnetism, unifying electric and magnetic phenomena into four equations and predicting electromagnetic waves.",
      eventDate:   new Date("1873-01-01"),
      category:    "Physics History",
      isEraEnd:    true,
      eraName:     "Classical Physics",
      ...adminOwner,
    },
    // Historical physics milestone — linked to article-special-relativity + article-general-relativity
    {
      slug:        "event-special-relativity-1905",
      title:       "Einstein's Annus Mirabilis",
      description: "Albert Einstein publishes four landmark papers in 1905: the photoelectric effect, Brownian motion, special relativity, and mass-energy equivalence (E=mc²).",
      eventDate:   new Date("1905-06-30"),
      category:    "Physics History",
      isEraStart:  true,
      eraName:     "Modern Physics",
      ...adminOwner,
    },
    // No description — exercises the nullable description path
    {
      slug:        "event-feynman-lectures-1964",
      title:       "Feynman Lectures on Physics Released",
      description: null,
      eventDate:   new Date("1964-01-01"),
      category:    "Mathematics",
      ...adminOwner,
    },
    // Recent product event — private (no access grant — tests access-denied path)
    {
      slug:        "event-principia-synthesia-launch-2025",
      title:       "Principia Synthesia Platform Launch",
      description: "Internal release announcement for the Principia Synthesia publishing platform. Restricted to authorized users.",
      eventDate:   new Date("2025-01-15"),
      category:    "Product Update",
      ...adminOwner,
    },
  ]).onConflictDoNothing();

  // Events owned by dr-feynman (if seeded)
  if (feynmanRow) {
    await db.insert(events).values([
      {
        slug:        "event-nobel-prize-1965",
        title:       "Nobel Prize in Physics 1965",
        // No description — exercises nullable path on a different publisher
        description: null,
        eventDate:   new Date("1965-10-21"),
        category:    "Personal",
        ownerType:   "user" as const,
        ownerId:     feynmanRow.id,
      },
      {
        slug:        "event-qed-published-1985",
        title:       "QED: The Strange Theory of Light and Matter",
        description: "Richard Feynman's popular-science book QED is published, distilling quantum electrodynamics into an accessible account of how light and matter interact.",
        eventDate:   new Date("1985-03-01"),
        category:    "Personal",
        ownerType:   "user" as const,
        ownerId:     feynmanRow.id,
      },
    ]).onConflictDoNothing();
    console.log("  2 events seeded (dr-feynman)");
  }

  // Events owned by faculty org (if seeded)
  if (facultyOrg) {
    await db.insert(events).values([
      {
        slug:        "event-faculty-symposium-2024",
        title:       "Annual Faculty Physics Symposium 2024",
        description: "The Faculty Consortium's annual physics symposium featuring talks on wave optics, classical mechanics, and emerging topics in quantum field theory.",
        eventDate:   new Date("2024-09-15"),
        category:    "Conference",
        ownerType:   "org" as const,
        ownerId:     facultyOrg.id,
      },
    ]).onConflictDoNothing();
    console.log("  1 event seeded (faculty org)");
  }

  // Fetch seeded event IDs for FK lookups
  const adminEvents = await db
    .select()
    .from(events)
    .where(and(eq(events.ownerType, "user"), eq(events.ownerId, adminRow.id)));
  const evtBySlug = Object.fromEntries(adminEvents.map((e) => [e.slug, e]));

  console.log(`  ${adminEvents.length} admin events seeded (principia-official)`);

  // ── 16. Event-Article links ────────────────────────────────────────────────
  console.log("[seed] Seeding event-article links...");

  // eventArticles has a unique constraint on (eventId, articleId) — safe to use onConflictDoNothing
  const evtArticleLinks: Array<[string, string]> = [
    ["event-principia-mathematica-1687", "article-newtons-laws"],
    ["event-maxwells-treatise-1873",     "article-maxwells-equations"],
    ["event-special-relativity-1905",    "article-special-relativity"],
    ["event-special-relativity-1905",    "article-general-relativity"],
  ];

  let newEvtLinks = 0;
  for (const [evtSlug, artSlug] of evtArticleLinks) {
    const evt = evtBySlug[evtSlug];
    const art = allArtBySlug[artSlug];
    if (evt && art) {
      await db.insert(eventArticles).values({
        eventId:   evt.id,
        articleId: art.id,
      }).onConflictDoNothing();
      newEvtLinks++;
    } else {
      console.log(`  WARN: could not link ${evtSlug} → ${artSlug} (evt=${!!evt}, art=${!!art})`);
    }
  }
  console.log(`  ${newEvtLinks} event-article links inserted`);

  // ── 17. Event Visibility ───────────────────────────────────────────────────
  console.log("[seed] Seeding event visibility...");

  // Private event: event-principia-synthesia-launch-2025 (no grant — tests denial path)
  const launchEvt = evtBySlug["event-principia-synthesia-launch-2025"];
  if (launchEvt) {
    await db.insert(resourceVisibility).values({
      resourceType: "event",
      ...adminOwner,
      resourceKey:  "event-principia-synthesia-launch-2025",
      visibility:   "private",
    }).onConflictDoNothing();
    console.log("  event-principia-synthesia-launch-2025 → private (no grant — access denied path)");
  }

  // ── 18. Article Snapshots ─────────────────────────────────────────────────────
  console.log("[seed] Seeding article snapshots...");

  // Helper: create a snapshot row idempotently (onConflictDoNothing on articleId+contentHash)
  async function seedSnapshot(
    art: { id: number; title: string; summary: string | null; content: string | null; metadata: ArticleMetadataShape },
    overrideContent?: string,
    overridePublishedAt?: Date
  ) {
    const content = overrideContent ?? art.content ?? "";
    const contentHash = createHash("sha256").update(content).digest("hex");
    const shortHash = contentHash.slice(0, 7);
    await db.insert(articleSnapshots).values({
      articleId: art.id,
      contentHash,
      shortHash,
      title: art.title,
      summary: art.summary ?? null,
      content,
      metadata: art.metadata,
      publishedAt: overridePublishedAt ?? new Date(),
    }).onConflictDoNothing();
    return shortHash;
  }

  // article-newtons-laws: 2 snapshots (one earlier version, one current)
  const newtonsArtSnap = artBySlug["article-newtons-laws"];
  if (newtonsArtSnap) {
    const earlierContent = `---
status: published
tags: ["mechanics","classical-physics"]
description: "Newton's three laws — first edition."
canvas: null
---

# Newton's Laws of Motion

## First Law

An object at rest remains at rest unless acted upon by a net external force.

## Second Law

$$
\\vec{F} = m\\vec{a}
$$

## Third Law

Every action has an equal and opposite reaction.`;

    const sh1 = await seedSnapshot(
      { ...newtonsArtSnap, metadata: newtonsArtSnap.metadata as ArticleMetadataShape },
      earlierContent,
      daysAgo(30)
    );
    const sh2 = await seedSnapshot(
      { ...newtonsArtSnap, metadata: newtonsArtSnap.metadata as ArticleMetadataShape },
      undefined, // current content
      daysAgo(2)
    );
    console.log(`  article-newtons-laws: 2 snapshots (${sh1}, ${sh2})`);
  }

  // Single snapshot for each of these published articles
  const snapshotTargets = [
    "article-general-relativity",
    "article-maxwells-equations",
    "article-thermodynamics-laws",
    "article-special-relativity",
  ];

  for (const slug of snapshotTargets) {
    const art = artBySlug[slug];
    if (art) {
      const sh = await seedSnapshot(
        { ...art, metadata: art.metadata as ArticleMetadataShape },
        undefined,
        daysAgo(Math.floor(Math.random() * 20 + 1))
      );
      console.log(`  ${slug}: 1 snapshot (${sh})`);
    }
  }

  // ── 19. Article Staleness (last_verified_at) ───────────────────────────────
  console.log("[seed] Seeding article staleness dates...");

  // Recent verifications (within 30 days) — stale banner should NOT show
  const recentlyVerified = [
    "article-newtons-laws",
    "article-general-relativity",
    "article-maxwells-equations",
  ];

  for (const slug of recentlyVerified) {
    const art = artBySlug[slug];
    if (art) {
      await db
        .update(articles)
        .set({ lastVerifiedAt: daysAgo(Math.floor(Math.random() * 25 + 1)) })
        .where(eq(articles.id, art.id));
    }
  }

  // Old verifications (over 180 days ago) — stale banner SHOULD show
  const staleArticles = [
    "article-thermodynamics-laws",
    "article-special-relativity",
    "article-aether-theory",
  ];

  for (const slug of staleArticles) {
    const art = artBySlug[slug];
    if (art) {
      await db
        .update(articles)
        .set({ lastVerifiedAt: daysAgo(Math.floor(Math.random() * 60 + 180)) })
        .where(eq(articles.id, art.id));
    }
  }

  // Null last_verified_at (never verified explicitly) for draft and review articles
  for (const slug of ["article-quantum-mechanics-draft", "article-statistical-mechanics"]) {
    const art = artBySlug[slug];
    if (art) {
      await db
        .update(articles)
        .set({ lastVerifiedAt: null })
        .where(eq(articles.id, art.id));
    }
  }

  console.log(
    `  3 recently verified, 3 stale (>180 days), 2 never verified (null)`
  );

  // ── 20. Analytics — views with referrer columns ───────────────────────────
  console.log("[seed] Seeding article views with referrer data...");

  // Guard: only insert if no row already has a referrerSource set
  const existingReferrerViews = await db
    .select({ id: articleViews.id })
    .from(articleViews)
    .where(isNotNull(articleViews.referrerSource))
    .limit(1);

  if (existingReferrerViews.length === 0) {
    // Deterministic fake session IDs (32 hex chars each)
    const sessions = {
      alice:   "a1b2c3d4e5f60718293a4b5c6d7e8f90",
      bob:     "b2c3d4e5f60718293a4b5c6d7e8f90a1",
      carol:   "c3d4e5f60718293a4b5c6d7e8f90a1b2",
      dave:    "d4e5f60718293a4b5c6d7e8f90a1b2c3",
      eve:     "e5f60718293a4b5c6d7e8f90a1b2c3d4",
    };

    type ReferrerSource = "direct" | "search" | "social" | "internal" | "external";

    const referrerViewConfig: Array<{
      artSlug: string;
      source: ReferrerSource;
      referrer: string | null;
      session: string;
      daysBackMin: number;
      daysBackMax: number;
      count: number;
    }> = [
      // direct traffic
      { artSlug: "article-newtons-laws",       source: "direct",   referrer: null,                                    session: sessions.alice, daysBackMin: 1,  daysBackMax: 7,  count: 4 },
      { artSlug: "article-general-relativity", source: "direct",   referrer: null,                                    session: sessions.bob,   daysBackMin: 2,  daysBackMax: 10, count: 3 },
      // search engine traffic
      { artSlug: "article-newtons-laws",       source: "search",   referrer: "https://google.com/search?q=newton+laws",   session: sessions.carol, daysBackMin: 1,  daysBackMax: 14, count: 5 },
      { artSlug: "article-special-relativity", source: "search",   referrer: "https://bing.com/search?q=special+relativity", session: sessions.dave,  daysBackMin: 3,  daysBackMax: 20, count: 3 },
      { artSlug: "article-maxwells-equations", source: "search",   referrer: "https://duckduckgo.com/?q=maxwell+equations",  session: sessions.eve,   daysBackMin: 5,  daysBackMax: 25, count: 2 },
      // social media traffic
      { artSlug: "article-general-relativity", source: "social",   referrer: "https://twitter.com",                   session: sessions.alice, daysBackMin: 2,  daysBackMax: 15, count: 4 },
      { artSlug: "article-thermodynamics-laws",source: "social",   referrer: "https://reddit.com/r/Physics",           session: sessions.bob,   daysBackMin: 1,  daysBackMax: 12, count: 3 },
      { artSlug: "article-newtons-laws",       source: "social",   referrer: "https://linkedin.com",                  session: sessions.carol, daysBackMin: 4,  daysBackMax: 18, count: 2 },
      // internal cross-link traffic
      { artSlug: "article-general-relativity", source: "internal", referrer: "https://principia.dev/principia-official/articles/article-newtons-laws", session: sessions.dave,  daysBackMin: 1,  daysBackMax: 8,  count: 6 },
      { artSlug: "article-maxwells-equations", source: "internal", referrer: "https://principia.dev/principia-official/books/book-classical-physics",  session: sessions.eve,   daysBackMin: 2,  daysBackMax: 10, count: 4 },
      // external site referrals
      { artSlug: "article-special-relativity", source: "external", referrer: "https://en.wikipedia.org/wiki/Special_relativity",  session: sessions.alice, daysBackMin: 3,  daysBackMax: 20, count: 3 },
      { artSlug: "article-newtons-laws",       source: "external", referrer: "https://physicsclassroom.com/class/newtlaws", session: sessions.bob,   daysBackMin: 5,  daysBackMax: 25, count: 2 },
    ];

    const referrerViewRows: Array<{
      articleId: number;
      viewedAt: Date;
      referrer: string | null;
      referrerSource: string;
      sessionId: string;
    }> = [];

    for (const cfg of referrerViewConfig) {
      const art = allArtBySlug[cfg.artSlug];
      if (!art) continue;
      for (let i = 0; i < cfg.count; i++) {
        const daysBack = cfg.daysBackMin + Math.floor(Math.random() * (cfg.daysBackMax - cfg.daysBackMin + 1));
        referrerViewRows.push({
          articleId:      art.id,
          viewedAt:       daysAgo(daysBack),
          referrer:       cfg.referrer,
          referrerSource: cfg.source,
          sessionId:      cfg.session,
        });
      }
    }

    if (referrerViewRows.length > 0) {
      await db.insert(articleViews).values(referrerViewRows);
      console.log(`  ${referrerViewRows.length} referrer-tagged view events inserted (covering all 5 sources)`);
    }
  } else {
    console.log("  referrer-tagged article views already exist — skipped");
  }

  // ── 21. Article Forking ────────────────────────────────────────────────────
  console.log("[seed] Seeding forked articles...");

  const originalArtForFork = artBySlug["article-maxwells-equations"];

  if (feynmanRow && originalArtForFork) {
    // Build forked content: copy of original but mark as a fork
    const forkedContent = `---
status: draft
tags: ["electromagnetism","waves","fork"]
description: "Feynman's annotated fork of Maxwell's Equations — adds intuition notes."
canvas: null
---

# Maxwell's Equations (Feynman's Notes)

> This is a fork of [[principia-official:articles:article-maxwells-equations]] with added physical intuition.

## Differential Form

| Equation | Expression |
|----------|------------|
| Gauss (electric) | $\\nabla \\cdot \\mathbf{E} = \\rho/\\varepsilon_0$ |
| Gauss (magnetic) | $\\nabla \\cdot \\mathbf{B} = 0$ |
| Faraday | $\\nabla \\times \\mathbf{E} = -\\partial\\mathbf{B}/\\partial t$ |
| Ampere-Maxwell | $\\nabla \\times \\mathbf{B} = \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\,\\partial\\mathbf{E}/\\partial t$ |

## Physical Intuition (Feynman's Gloss)

Gauss's law is about sources — charges create diverging electric field lines. Faraday's law is the heart of induction: a changing magnetic field *creates* an electric field. The Ampere-Maxwell correction ($\\mu_0\\varepsilon_0\\,\\partial\\mathbf{E}/\\partial t$) is what predicts electromagnetic waves even in vacuum.

$$
c = \\frac{1}{\\sqrt{\\mu_0\\varepsilon_0}}
$$`;

    await db.insert(articles).values({
      slug:         "article-maxwells-equations",
      title:        "Maxwell's Equations (Feynman's Notes)",
      summary:      "Feynman's annotated fork of Maxwell's Equations with physical intuition.",
      content:      forkedContent,
      ownerType:    "user" as const,
      ownerId:      feynmanRow.id,
      isInternal:   false,
      parentBookId: null,
      forkedFromId: originalArtForFork.id,
      metadata: {
        status: "draft",
        tags: ["electromagnetism", "waves", "fork"],
        description: "Feynman's annotated fork of Maxwell's Equations — adds intuition notes.",
        canvas: null,
      } satisfies ArticleMetadataShape,
      createdAt:      new Date(),
      updatedAt:      new Date(),
      lastVerifiedAt: null,
    }).onConflictDoNothing();

    const [forkedArt] = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.ownerType, "user"),
          eq(articles.ownerId, feynmanRow.id),
          eq(articles.slug, "article-maxwells-equations")
        )
      );

    if (forkedArt) {
      console.log(
        `  forked: dr-feynman/article-maxwells-equations (forkedFromId=${originalArtForFork.id})`
      );

      // Notification for the original author (admin) that their article was forked
      if (adminRow) {
        await db.insert(notifications).values({
          userId:    adminRow.id,
          type:      "article_forked",
          payload:   {
            forkedArticleId:     forkedArt.id,
            forkerPublisherSlug: "dr-feynman",
            originalSlug:        "article-maxwells-equations",
            originalTitle:       "Maxwell's Equations",
          } satisfies Record<string, unknown>,
          createdAt: new Date(),
        });
      }
    }
  }

  // ── 22. Notifications ─────────────────────────────────────────────────────
  console.log("[seed] Seeding notifications...");

  // Guard: use "stale_articles_digest" type as sentinel — if one already exists, skip all notification seeding.
  // The article_forked notification was already inserted in section 21 above.
  const existingDigestNotif = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(sql`${notifications.type} = 'stale_articles_digest'`)
    .limit(1);

  if (existingDigestNotif.length === 0) {
    const staleThermodynamicsArt = artBySlug["article-thermodynamics-laws"];
    const staleSpecialRelArt     = artBySlug["article-special-relativity"];
    const staleAetherArt         = artBySlug["article-aether-theory"];
    const secretArtForNotif      = artBySlug["article-secret-formula"];

    const feynmanPathArt = feynmanRow
      ? (await db.select().from(articles).where(
          and(
            eq(articles.ownerType, "user"),
            eq(articles.ownerId, feynmanRow.id),
            eq(articles.slug, "article-feynman-path-integral")
          )
        ))[0]
      : null;

    const feynmanQedArt = feynmanRow
      ? (await db.select().from(articles).where(
          and(
            eq(articles.ownerType, "user"),
            eq(articles.ownerId, feynmanRow.id),
            eq(articles.slug, "article-qed-overview")
          )
        ))[0]
      : null;

    // ── Admin: one stale_articles_digest (unread) with 3 stale articles ──
    const adminStaleItems = [
      staleThermodynamicsArt && {
        articleId:     staleThermodynamicsArt.id,
        slug:          "article-thermodynamics-laws",
        publisherSlug: "principia-official",
        title:         "Laws of Thermodynamics",
      },
      staleSpecialRelArt && {
        articleId:     staleSpecialRelArt.id,
        slug:          "article-special-relativity",
        publisherSlug: "principia-official",
        title:         "Special Relativity",
      },
      staleAetherArt && {
        articleId:     staleAetherArt.id,
        slug:          "article-aether-theory",
        publisherSlug: "principia-official",
        title:         "Luminiferous Aether (Archived)",
      },
    ].filter(Boolean);

    if (adminStaleItems.length > 0) {
      await db.insert(notifications).values({
        userId:    adminRow.id,
        type:      "stale_articles_digest",
        payload:   {
          articles: adminStaleItems,
          count:    adminStaleItems.length,
        } satisfies Record<string, unknown>,
        readAt:    null,
        createdAt: daysAgo(3),
      });
    }

    // Admin: article_cited notification (read — exercises "read" state)
    if (staleSpecialRelArt && secretArtForNotif) {
      await db.insert(notifications).values({
        userId:    adminRow.id,
        type:      "article_cited",
        payload:   {
          citingArticleId:     secretArtForNotif.id,
          citingPublisherSlug: "principia-official",
          citingSlug:          "article-secret-formula",
          citingTitle:         "Secret Formula",
          citedSlug:           "article-special-relativity",
        } satisfies Record<string, unknown>,
        readAt:    daysAgo(1),
        createdAt: daysAgo(2),
      });
    }

    // ── Feynman: one stale_articles_digest (unread) + article_cited (read) ──
    if (feynmanRow) {
      const feynmanStaleItems = [
        feynmanPathArt && {
          articleId:     feynmanPathArt.id,
          slug:          "article-feynman-path-integral",
          publisherSlug: "dr-feynman",
          title:         "Feynman Path Integrals",
        },
        feynmanQedArt && {
          articleId:     feynmanQedArt.id,
          slug:          "article-qed-overview",
          publisherSlug: "dr-feynman",
          title:         "Quantum Electrodynamics",
        },
      ].filter(Boolean);

      if (feynmanStaleItems.length > 0) {
        await db.insert(notifications).values({
          userId:    feynmanRow.id,
          type:      "stale_articles_digest",
          payload:   {
            articles: feynmanStaleItems,
            count:    feynmanStaleItems.length,
          } satisfies Record<string, unknown>,
          readAt:    null,
          createdAt: daysAgo(10),
        });
      }

      // article_cited — someone cited QED overview (unread)
      if (feynmanQedArt && secretArtForNotif) {
        await db.insert(notifications).values({
          userId:    feynmanRow.id,
          type:      "article_cited",
          payload:   {
            citingArticleId:     secretArtForNotif.id,
            citingPublisherSlug: "principia-official",
            citingSlug:          "article-secret-formula",
            citingTitle:         "Secret Formula",
            citedSlug:           "article-qed-overview",
          } satisfies Record<string, unknown>,
          readAt:    null,
          createdAt: daysAgo(4),
        });
      }

      // article_cited — read (for variety)
      if (feynmanQedArt) {
        await db.insert(notifications).values({
          userId:    feynmanRow.id,
          type:      "article_cited",
          payload:   {
            citingArticleId:     feynmanQedArt.id,
            citingPublisherSlug: "dr-feynman",
            citingSlug:          "article-qed-overview",
            citingTitle:         "Quantum Electrodynamics",
            citedSlug:           "article-feynman-path-integral",
          } satisfies Record<string, unknown>,
          readAt:    daysAgo(3),
          createdAt: daysAgo(7),
        });
      }
    }

    console.log("  stale_articles_digest and article_cited notifications seeded (read + unread mix)");
  } else {
    console.log("  notifications already seeded — skipped");
  }

  // ── 23. Article Citations (articleCitations table) ────────────────────────
  console.log("[seed] Seeding article citations...");

  // Refresh the full article map now that the forked article has been inserted
  const allArticlesRefreshed = await db.select().from(articles);
  const allArtBySlugFinal = Object.fromEntries(allArticlesRefreshed.map((a) => [a.slug + "|" + a.ownerId, a]));

  // Helper: get article by slug + ownerId
  function getArt(slug: string, ownerId: number) {
    return allArtBySlugFinal[slug + "|" + ownerId];
  }

  // Citation 1: article-newtons-laws cites article-general-relativity
  //   (matches the <Cite slug="principia-official/article-general-relativity" /> added above)
  const newtonsArtFinal = getArt("article-newtons-laws", adminRow.id);
  const generalRelArtFinal = getArt("article-general-relativity", adminRow.id);
  const maxwellsArtFinal = getArt("article-maxwells-equations", adminRow.id);

  if (newtonsArtFinal && generalRelArtFinal) {
    await db.insert(articleCitations).values({
      citingArticleId: newtonsArtFinal.id,
      citedArticleId:  generalRelArtFinal.id,
      position:        0,
    }).onConflictDoNothing();
    console.log("  citation: article-newtons-laws → article-general-relativity (pos 0)");
  }

  // Citation 2: article-newtons-laws cites article-maxwells-equations
  //   (matches the <Cite slug="principia-official/article-maxwells-equations" /> added above)
  if (newtonsArtFinal && maxwellsArtFinal) {
    await db.insert(articleCitations).values({
      citingArticleId: newtonsArtFinal.id,
      citedArticleId:  maxwellsArtFinal.id,
      position:        1,
    }).onConflictDoNothing();
    console.log("  citation: article-newtons-laws → article-maxwells-equations (pos 1)");
  }

  // Citation 3: article-general-relativity cites article-special-relativity
  const specialRelArtFinal = getArt("article-special-relativity", adminRow.id);
  if (generalRelArtFinal && specialRelArtFinal) {
    await db.insert(articleCitations).values({
      citingArticleId: generalRelArtFinal.id,
      citedArticleId:  specialRelArtFinal.id,
      position:        0,
    }).onConflictDoNothing();
    console.log("  citation: article-general-relativity → article-special-relativity (pos 0)");
  }

  // ── Summary ────────────────────────────────────────────────────────────────────
  console.log("\n[seed] Seeding complete!\n");
  console.log("  Users:");
  console.log(`    admin         ${adminEmail ?? "(not seeded)"}  (isRootAdmin=true, publisher=principia-official)`);
  console.log(`    dr-feynman    ${viewerEmail ?? "(not seeded)"}  (isRootAdmin=false, publisher=dr-feynman)`);
  console.log("    mit-ocw       mit@example.com           (isRootAdmin=false, publisher=mit-ocw)");
  console.log("    quantum-lab   quantum@example.com        (isRootAdmin=false, publisher=quantum-lab)");
  console.log("  Orgs:");
  console.log("    faculty           (super_admin=admin, admin=dr-feynman, member=mit-ocw)");
  console.log("    quantum-institute (super_admin=quantum-lab, member=dr-feynman)");
  console.log("  Articles:");
  console.log("    9 admin-owned (5 published, 1 draft, 1 review, 1 archived, 1 private)");
  console.log("    2 internal admin-owned (Appendix A, Appendix B — book-classical-physics only)");
  console.log("    2 feynman-owned (published)");
  console.log("    1 faculty-org-owned (published)");
  console.log("  Books:");
  console.log("    book-classical-physics  (5 regular + 2 internal + 2 cross-publisher chapters) — public");
  console.log("      cross-publisher: article-feynman-path-integral (dr-feynman, pos 7)");
  console.log("      cross-publisher: article-qed-overview          (dr-feynman, pos 8)");
  console.log("    book-quantum-primer     (4 chapters)                                — org-visible");
  console.log("    book-advanced-topics    (3 chapters)                                — private");
  console.log("    book-faculty-lectures   (2 chapters)                                — org-visible");
  console.log("  KAO Objects:");
  console.log("    anim-pendulum (admin), anim-lissajous (admin), anim-wave-superposition (faculty)");
  console.log("    object-periodic-table (dataset), object-newtonian-flow (diagram)");
  console.log("  Visibility & Grants:");
  console.log("    article-secret-formula: private — dr-feynman granted, mit-ocw/quantum-lab denied");
  console.log("    book-quantum-primer: org — faculty org members can see it");
  console.log("    book-advanced-topics: private — quantum-institute org granted, mit-ocw denied");
  console.log("    book-faculty-lectures: org — faculty org members can see it");
  console.log("  Events:");
  console.log("    principia-official: event-principia-mathematica-1687 (1687, Physics History)");
  console.log("    principia-official: event-maxwells-treatise-1873 (1873, Physics History)");
  console.log("    principia-official: event-special-relativity-1905 (1905, Physics History)");
  console.log("    principia-official: event-feynman-lectures-1964 (1964, Mathematics, no description)");
  console.log("    principia-official: event-principia-synthesia-launch-2025 (2025, Product Update, PRIVATE)");
  console.log("    dr-feynman: event-nobel-prize-1965, event-qed-published-1985");
  console.log("    faculty org: event-faculty-symposium-2024");
  console.log("  Event-Article links:");
  console.log("    event-principia-mathematica-1687 → article-newtons-laws");
  console.log("    event-maxwells-treatise-1873     → article-maxwells-equations");
  console.log("    event-special-relativity-1905    → article-special-relativity, article-general-relativity");

  // Convert legacy partTitle-on-chapter seed data into first-class part
  // divider rows (same transform as migration 0020; idempotent because the
  // final UPDATE leaves no chapter rows carrying a partTitle).
  await db.execute(sql`UPDATE curriculum_entries SET position = position * 2 + 1 WHERE part_title IS NOT NULL AND article_id IS NOT NULL`);
  await db.execute(sql`INSERT INTO curriculum_entries (book_id, article_id, position, part_title)
    SELECT book_id, NULL, position - 1, part_title FROM curriculum_entries
    WHERE part_title IS NOT NULL AND article_id IS NOT NULL`);
  await db.execute(sql`UPDATE curriculum_entries SET part_title = NULL WHERE article_id IS NOT NULL`);
  console.log("  Converted part titles to divider entries");

  process.exit(0);
}

seed().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
