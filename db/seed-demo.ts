/**
 * db/seed-demo.ts — Comprehensive demo seed for Principia Synthesia
 *
 * Creates:
 *   - 4 users (1 root admin + 3 demo users) with publisher slugs
 *   - 2 organizations with memberships covering all three roles
 *   - 4–6 categories
 *   - 12 articles (published, draft, archived; public, org-visible, private)
 *   - 2 books with 3–5 chapters each (one owned by a user, one by an org)
 *   - 3 KAO objects (1 animation, 1 dataset, 1 diagram)
 *   - Revisions, article views, resource visibility, access grants
 *   - User themes for admin user
 *   - Book snapshots
 *
 * Idempotent: every insert uses onConflictDoNothing() so re-running is safe.
 *
 * Credentials:
 *   Admin:   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars
 *   Viewers: hardcoded demo passwords (non-sensitive demo accounts)
 */

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
} from "./schema";
import type { ArticleMetadataShape } from "./schema";
import { eq, and } from "drizzle-orm";
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

  const adminEmail    = process.env.SEED_ADMIN_EMAIL    ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123456";
  const viewerEmail   = process.env.SEED_VIEWER_EMAIL   ?? "viewer@example.com";
  const viewerPassword = process.env.SEED_VIEWER_PASSWORD ?? "viewer123456";

  // Root admin — credentials from env
  await db.insert(users).values({
    email:         adminEmail,
    passwordHash:  await hash(adminPassword),
    isRootAdmin:   true,
    displayName:   "Principia Admin",
    publisherSlug: "principia-official",
  }).onConflictDoNothing();

  // Demo viewer 1 — credentials optionally from env
  await db.insert(users).values({
    email:         viewerEmail,
    passwordHash:  await hash(viewerPassword),
    isRootAdmin:   false,
    displayName:   "Dr. Feynman",
    publisherSlug: "dr-feynman",
  }).onConflictDoNothing();

  // Demo viewer 2 — fixed demo password (not sensitive)
  await db.insert(users).values({
    email:         "mit@example.com",
    passwordHash:  await hash("MitOcw-demo-2026!"),
    isRootAdmin:   false,
    displayName:   "MIT OCW",
    publisherSlug: "mit-ocw",
  }).onConflictDoNothing();

  // Demo viewer 3 — fixed demo password
  await db.insert(users).values({
    email:         "quantum@example.com",
    passwordHash:  await hash("QuantumLab-demo-2026!"),
    isRootAdmin:   false,
    displayName:   "Quantum Lab",
    publisherSlug: "quantum-lab",
  }).onConflictDoNothing();

  const [admin]    = await db.select().from(users).where(eq(users.email, adminEmail));
  const [feynman]  = await db.select().from(users).where(eq(users.email, viewerEmail));
  const [mitUser]  = await db.select().from(users).where(eq(users.email, "mit@example.com"));
  const [qLabUser] = await db.select().from(users).where(eq(users.email, "quantum@example.com"));

  if (!admin) throw new Error("[seed] Admin user not found after insert — aborting.");
  console.log(`  admin:      ${admin.email}  (id=${admin.id}, publisher=principia-official)`);
  if (feynman)  console.log(`  feynman:    ${feynman.email}  (id=${feynman.id})`);
  if (mitUser)  console.log(`  mit-ocw:    ${mitUser.email}  (id=${mitUser.id})`);
  if (qLabUser) console.log(`  quantum:    ${qLabUser.email}  (id=${qLabUser.id})`);

  // ── 2. Publishers ─────────────────────────────────────────────────────────────
  console.log("[seed] Seeding publishers...");

  await db.insert(publishers).values({
    slug:   "principia-official",
    kind:   "user",
    userId: admin.id,
    orgId:  null,
  }).onConflictDoNothing();

  if (feynman) {
    await db.insert(publishers).values({
      slug:   "dr-feynman",
      kind:   "user",
      userId: feynman.id,
      orgId:  null,
    }).onConflictDoNothing();
  }

  if (mitUser) {
    await db.insert(publishers).values({
      slug:   "mit-ocw",
      kind:   "user",
      userId: mitUser.id,
      orgId:  null,
    }).onConflictDoNothing();
  }

  if (qLabUser) {
    await db.insert(publishers).values({
      slug:   "quantum-lab",
      kind:   "user",
      userId: qLabUser.id,
      orgId:  null,
    }).onConflictDoNothing();
  }

  console.log("  4 user publishers registered");

  // ── 3. Organizations ──────────────────────────────────────────────────────────
  console.log("[seed] Seeding organizations...");

  // Org 1: Faculty consortium — covers super_admin + admin + member roles
  await db.insert(organizations).values({
    slug:          "faculty",
    name:          "Faculty Consortium",
    publisherSlug: "faculty",
    creatorId:     admin.id,
  }).onConflictDoNothing();

  // Org 2: Quantum Lab group — separate org for org-visibility testing
  await db.insert(organizations).values({
    slug:          "quantum-institute",
    name:          "Quantum Institute",
    publisherSlug: "quantum-institute",
    creatorId:     admin.id,
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

    // super_admin: admin, admin role: feynman, member role: mitUser
    await db.insert(orgMemberships).values({
      orgId:  facultyOrg.id,
      userId: admin.id,
      role:   "super_admin",
    }).onConflictDoNothing();

    if (feynman) {
      await db.insert(orgMemberships).values({
        orgId:  facultyOrg.id,
        userId: feynman.id,
        role:   "admin",
      }).onConflictDoNothing();
    }

    if (mitUser) {
      await db.insert(orgMemberships).values({
        orgId:  facultyOrg.id,
        userId: mitUser.id,
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

    // super_admin: qLabUser, member: feynman
    if (qLabUser) {
      await db.insert(orgMemberships).values({
        orgId:  quantumOrg.id,
        userId: qLabUser.id,
        role:   "super_admin",
      }).onConflictDoNothing();
    }

    if (feynman) {
      await db.insert(orgMemberships).values({
        orgId:  quantumOrg.id,
        userId: feynman.id,
        role:   "member",
      }).onConflictDoNothing();
    }

    console.log("  org: quantum-institute  (super_admin=quantum-lab, member=dr-feynman)");
  }

  // ── 4. Categories ─────────────────────────────────────────────────────────────
  console.log("[seed] Seeding categories...");

  await db.insert(categories).values([
    { slug: "physics",           name: "Physics" },
    { slug: "mechanics",         name: "Classical Mechanics" },
    { slug: "electromagnetism",  name: "Electromagnetism" },
    { slug: "relativity",        name: "Relativity" },
    { slug: "quantum",           name: "Quantum Mechanics" },
    { slug: "thermodynamics",    name: "Thermodynamics" },
  ]).onConflictDoNothing();

  const allCats = await db.select().from(categories);
  const catBySlug = Object.fromEntries(allCats.map((c) => [c.slug, c]));
  console.log(`  ${allCats.length} categories`);

  // ── 5. Articles (owned by principia-official / admin) ─────────────────────────
  console.log("[seed] Seeding articles (principia-official)...");

  const adminOwner = { ownerType: "user" as const, ownerId: admin.id };

  const articleDefs = [
    // ── published, public ──────────────────────────────────────────────────────
    {
      slug:    "article-newtons-laws",
      title:   "Newton's Laws of Motion",
      summary: "The three fundamental laws governing classical mechanics.",
      metadata: {
        status: "published", tags: ["mechanics", "classical-physics"],
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

$$\\vec{p} = m\\vec{v} = \\text{const} \\quad \\text{when} \\quad \\vec{F}_{\\text{net}} = 0$$

## Second Law

The net force on an object equals the rate of change of its momentum:

$$\\vec{F} = m\\vec{a}$$

For variable mass systems (e.g. rockets), the full form is $\\vec{F} = \\frac{d(m\\vec{v})}{dt}$.

## Third Law

For every action there is an equal and opposite reaction:

$$\\vec{F}_{AB} = -\\vec{F}_{BA}$$

See also: [[principia-official:article:article-general-relativity]] for the relativistic extension.`,
    },
    {
      slug:    "article-general-relativity",
      title:   "General Relativity",
      summary: "Einstein's geometric theory of gravitation.",
      metadata: {
        status: "published", tags: ["relativity", "gravity", "einstein"],
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

$$G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}$$

where $G_{\\mu\\nu}$ is the Einstein tensor, $\\Lambda$ the cosmological constant, and $T_{\\mu\\nu}$ the stress-energy tensor.

## Geodesics

Free-falling particles follow geodesics — paths of extremal proper time:

$$\\frac{d^2 x^\\mu}{d\\tau^2} + \\Gamma^\\mu_{\\alpha\\beta} \\frac{dx^\\alpha}{d\\tau}\\frac{dx^\\beta}{d\\tau} = 0$$

## Schwarzschild Metric

For a spherically symmetric, non-rotating mass $M$:

$$ds^2 = -\\left(1 - \\frac{r_s}{r}\\right)c^2\\,dt^2 + \\left(1 - \\frac{r_s}{r}\\right)^{-1}dr^2 + r^2 d\\Omega^2$$

where $r_s = 2GM/c^2$ is the Schwarzschild radius.`,
    },
    {
      slug:    "article-maxwells-equations",
      title:   "Maxwell's Equations",
      summary: "The four fundamental equations of classical electromagnetism.",
      metadata: {
        status: "published", tags: ["electromagnetism", "waves"],
        description: "Gauss, Faraday, Ampère — the complete classical field theory of electromagnetism.",
        canvas: null,
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["electromagnetism","waves"]
description: "Gauss, Faraday, Ampère — the complete classical field theory of electromagnetism."
canvas: null
---

# Maxwell's Equations

## Differential Form

| Equation | Expression |
|----------|------------|
| Gauss (electric) | $\\nabla \\cdot \\mathbf{E} = \\rho/\\varepsilon_0$ |
| Gauss (magnetic) | $\\nabla \\cdot \\mathbf{B} = 0$ |
| Faraday | $\\nabla \\times \\mathbf{E} = -\\partial\\mathbf{B}/\\partial t$ |
| Ampère–Maxwell | $\\nabla \\times \\mathbf{B} = \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\,\\partial\\mathbf{E}/\\partial t$ |

## Electromagnetic Waves

In vacuum ($\\rho=0$, $\\mathbf{J}=0$) the equations reduce to the wave equation:

$$\\nabla^2\\mathbf{E} - \\mu_0\\varepsilon_0 \\frac{\\partial^2 \\mathbf{E}}{\\partial t^2} = 0$$

with wave speed $c = 1/\\sqrt{\\mu_0\\varepsilon_0} \\approx 3\\times 10^8\\,\\text{m/s}$.`,
    },
    {
      slug:    "article-thermodynamics-laws",
      title:   "Laws of Thermodynamics",
      summary: "The zeroth through third laws governing heat, energy, and entropy.",
      metadata: {
        status: "published", tags: ["thermodynamics", "entropy", "heat"],
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

$$\\Delta U = Q - W$$

The change in internal energy equals heat added minus work done by the system.

## Second Law — Entropy

In any spontaneous process the total entropy of an isolated system does not decrease:

$$\\Delta S_{\\text{universe}} \\geq 0$$

The Clausius inequality: $dS \\geq \\delta Q / T$.

## Third Law

As temperature approaches absolute zero, the entropy of a perfect crystal approaches zero:

$$\\lim_{T \\to 0} S = 0$$`,
    },
    {
      slug:    "article-special-relativity",
      title:   "Special Relativity",
      summary: "Time dilation, length contraction, and mass-energy equivalence.",
      metadata: {
        status: "published", tags: ["relativity", "einstein", "spacetime"],
        description: "Einstein's 1905 postulates and their consequences: $E=mc^2$, Lorentz transformations, twin paradox.",
        canvas: "anim-pendulum",
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["relativity","einstein","spacetime"]
description: "Einstein's 1905 postulates and their consequences."
canvas: "anim-pendulum"
---

# Special Relativity

## The Two Postulates

1. The laws of physics are the same in all inertial reference frames.
2. The speed of light in vacuum is $c \\approx 3\\times 10^8\\,\\text{m/s}$ for all observers.

## Lorentz Factor

$$\\gamma = \\frac{1}{\\sqrt{1 - v^2/c^2}}$$

## Time Dilation and Length Contraction

$$\\Delta t' = \\gamma\\,\\Delta t \\qquad L' = L/\\gamma$$

## Mass–Energy Equivalence

$$E = mc^2 \\qquad E^2 = (pc)^2 + (mc^2)^2$$

See also [[principia-official:article:article-general-relativity]] for the curved-spacetime extension.`,
    },
    // ── draft ─────────────────────────────────────────────────────────────────
    {
      slug:    "article-quantum-mechanics-draft",
      title:   "Quantum Mechanics (Draft)",
      summary: "Work-in-progress on wave mechanics and the Schrödinger equation.",
      metadata: {
        status: "draft", tags: ["quantum", "wip"],
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

## Schrödinger Equation

$$i\\hbar \\frac{\\partial\\Psi}{\\partial t} = \\hat{H}\\Psi$$

**TODO:** expand on eigenvalues, measurement postulate, and commutator relations.`,
    },
    // ── review ────────────────────────────────────────────────────────────────
    {
      slug:    "article-statistical-mechanics",
      title:   "Statistical Mechanics",
      summary: "Bridge between microscopic dynamics and macroscopic thermodynamics.",
      metadata: {
        status: "review", tags: ["thermodynamics", "statistical"],
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

$$P_i = \\frac{e^{-E_i/k_BT}}{Z}, \\quad Z = \\sum_i e^{-E_i/k_BT}$$

## Entropy

Boltzmann's famous relation:

$$S = k_B \\ln \\Omega$$

where $\\Omega$ is the number of accessible microstates.`,
    },
    // ── archived ──────────────────────────────────────────────────────────────
    {
      slug:    "article-aether-theory",
      title:   "Luminiferous Aether (Archived)",
      summary: "The now-disproved hypothesis of a medium for light propagation.",
      metadata: {
        status: "archived", tags: ["history", "disproved"],
        description: "Historical account of the aether hypothesis and its refutation by Michelson–Morley.",
        canvas: null,
      } satisfies ArticleMetadataShape,
      content: `---
status: archived
tags: ["history","disproved"]
description: "Historical account of the aether hypothesis and its refutation by Michelson–Morley."
canvas: null
---

# Luminiferous Aether (Archived)

This article has been archived. The aether theory was conclusively disproved by the Michelson–Morley experiment (1887) and superseded by special relativity.

## Historical Significance

The null result of the Michelson–Morley experiment was instrumental in motivating Einstein's 1905 postulates.`,
    },
    // ── private article (with explicit grant) ─────────────────────────────────
    {
      slug:    "article-secret-formula",
      title:   "Secret Formula",
      summary: "Restricted content — private article visible only to granted users.",
      metadata: {
        status: "published", tags: ["restricted"],
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

$$\\Phi = \\oint_S \\mathbf{B} \\cdot d\\mathbf{A} = \\mu_0 I_{\\text{enc}}$$`,
    },
  ];

  await db.insert(articles).values(
    articleDefs.map((a) => ({ ...a, ...adminOwner }))
  ).onConflictDoNothing();

  const adminArticles = await db
    .select()
    .from(articles)
    .where(and(eq(articles.ownerType, "user"), eq(articles.ownerId, admin.id)));
  const artBySlug = Object.fromEntries(adminArticles.map((a) => [a.slug, a]));
  console.log(`  ${adminArticles.length} articles (principia-official)`);

  // ── Articles owned by dr-feynman ──────────────────────────────────────────
  if (feynman) {
    const feynmanDefs = [
      {
        slug:    "article-feynman-path-integral",
        title:   "Feynman Path Integrals",
        summary: "The sum-over-histories formulation of quantum mechanics.",
        metadata: {
          status: "published", tags: ["quantum", "path-integral"],
          description: "Feynman's sum-over-paths approach: every path contributes with amplitude $e^{iS/\\hbar}$.",
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

$$K(x_f, t_f; x_i, t_i) = \\int \\mathcal{D}[x(t)]\\, e^{iS[x]/\\hbar}$$

Every path from $(x_i, t_i)$ to $(x_f, t_f)$ contributes. Classical paths dominate because nearby paths interfere constructively when $\\delta S = 0$.

## Connection to the Schrödinger Equation

The path-integral and operator formulations are equivalent — both reproduce $i\\hbar\\,\\partial_t\\Psi = \\hat{H}\\Psi$.`,
        ownerType: "user" as const,
        ownerId: feynman.id,
      },
      {
        slug:    "article-qed-overview",
        title:   "Quantum Electrodynamics",
        summary: "The quantum field theory of light and matter.",
        metadata: {
          status: "published", tags: ["quantum", "qed", "field-theory"],
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

$$\\mathcal{L} = \\bar{\\psi}(i\\gamma^\\mu D_\\mu - m)\\psi - \\frac{1}{4}F_{\\mu\\nu}F^{\\mu\\nu}$$

## Fine Structure Constant

$$\\alpha = \\frac{e^2}{4\\pi\\varepsilon_0 \\hbar c} \\approx \\frac{1}{137}$$

The anomalous magnetic moment $g-2$ is the most precisely tested prediction in physics.`,
        ownerType: "user" as const,
        ownerId: feynman.id,
      },
    ];

    await db.insert(articles).values(feynmanDefs).onConflictDoNothing();
    console.log("  2 articles (dr-feynman)");
  }

  // ── Articles owned by faculty org ─────────────────────────────────────────
  if (facultyOrg) {
    const facultyDefs = [
      {
        slug:    "article-wave-optics",
        title:   "Wave Optics",
        summary: "Diffraction, interference, and the wave nature of light.",
        metadata: {
          status: "published", tags: ["optics", "waves", "electromagnetism"],
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

$$I(\\theta) = I_0 \\cos^2\\left(\\frac{\\pi d \\sin\\theta}{\\lambda}\\right)$$

Bright fringes at $d\\sin\\theta = m\\lambda$, $m \\in \\mathbb{Z}$.

## Single-Slit Diffraction

$$I(\\theta) = I_0 \\left(\\frac{\\sin\\beta}{\\beta}\\right)^2, \\quad \\beta = \\frac{\\pi a \\sin\\theta}{\\lambda}$$`,
        ownerType: "org" as const,
        ownerId: facultyOrg.id,
      },
    ];

    await db.insert(articles).values(facultyDefs).onConflictDoNothing();
    console.log("  1 article (faculty org)");
  }

  // ── Refresh artBySlug after all articles are inserted ─────────────────────
  const allArticles = await db.select().from(articles);
  const allArtBySlug = Object.fromEntries(allArticles.map((a) => [a.slug, a]));

  // ── 6. Article categories ─────────────────────────────────────────────────────
  console.log("[seed] Seeding article categories...");

  const categoryLinks: Array<[string, string]> = [
    ["article-newtons-laws",       "mechanics"],
    ["article-newtons-laws",       "physics"],
    ["article-general-relativity", "physics"],
    ["article-general-relativity", "relativity"],
    ["article-maxwells-equations", "electromagnetism"],
    ["article-maxwells-equations", "physics"],
    ["article-thermodynamics-laws","thermodynamics"],
    ["article-thermodynamics-laws","physics"],
    ["article-special-relativity", "relativity"],
    ["article-special-relativity", "physics"],
    ["article-statistical-mechanics", "thermodynamics"],
    ["article-quantum-mechanics-draft", "quantum"],
    ["article-feynman-path-integral",   "quantum"],
    ["article-qed-overview",            "quantum"],
  ];

  for (const [artSlug, catSlug] of categoryLinks) {
    const art = allArtBySlug[artSlug];
    const cat = catBySlug[catSlug];
    if (art && cat) {
      await db.insert(articleCategories).values({
        articleId:  art.id,
        categoryId: cat.id,
      }).onConflictDoNothing();
    }
  }
  console.log(`  ${categoryLinks.length} category links`);

  // ── 7. Revisions (for article-newtons-laws) ────────────────────────────────
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
          content: "# Newton's Laws of Motion\n\n## First Law\n\nAn object at rest stays at rest.\n\n$$F = ma$$",
          editNote: "Added math and sections",
          editedAt: daysAgo(7),
        },
        {
          articleId: newtonsArt.id,
          content: "# Newton's Laws of Motion\n\n## First Law (Law of Inertia)\n\nAn object at rest remains at rest.\n\n## Second Law\n\n$$\\vec{F} = m\\vec{a}$$\n\n## Third Law\n\nAction = -Reaction.",
          editNote: "Third law added",
          editedAt: daysAgo(2),
        },
      ]);
      console.log("  3 revisions created for article-newtons-laws");
    } else {
      console.log("  revisions already exist — skipped");
    }
  }

  // ── 8. KAO Objects ────────────────────────────────────────────────────────────
  console.log("[seed] Seeding KAO objects...");

  await db.insert(objects).values([
    // Animation: simple pendulum (user-owned by admin)
    {
      slug:        "anim-pendulum",
      name:        "Simple Pendulum",
      type:        "animation",
      ...adminOwner,
      description: "A frictionless simple pendulum driven by gravity.",
      content: {
        code: `function SimplePendulum() {
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
}`,
      },
    },
    // Animation: Lissajous figures (user-owned by admin, second animation)
    {
      slug:        "anim-lissajous",
      name:        "Lissajous Figures",
      type:        "animation",
      ...adminOwner,
      description: "Parametric curves traced by two orthogonal sinusoidal motions.",
      content: {
        code: `function Lissajous() {
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
}`,
      },
    },
    // Dataset: periodic table subset (user-owned by admin)
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
    // Diagram: Newtonian force causal chain (user-owned by admin)
    {
      slug:        "object-newtonian-flow",
      name:        "Newtonian Mechanics Causal Chain",
      type:        "diagram",
      ...adminOwner,
      description: "Causal flow from applied force to resultant position.",
      content: {
        format: "mermaid",
        source: `graph TD
  F["Applied Force\\n\\\\(\\\\vec{F}\\\\)"] --> A["Acceleration\\n\\\\(a = F/m\\\\)"]
  M["Mass\\n\\\\(m\\\\)"] --> A
  A --> V["Velocity\\n\\\\(v = \\\\int a\\\\,dt\\\\)"]
  V0["Initial Velocity\\n\\\\(v_0\\\\)"] --> V
  V --> X["Position\\n\\\\(x = \\\\int v\\\\,dt\\\\)"]
  X0["Initial Position\\n\\\\(x_0\\\\)"] --> X`,
      },
    },
    // Animation owned by faculty org (demonstrates org ownership of objects)
    ...(facultyOrg ? [{
      slug:        "anim-wave-superposition",
      name:        "Wave Superposition",
      type:        "animation" as const,
      ownerType:   "org" as const,
      ownerId:     facultyOrg.id,
      description: "Two sinusoidal waves superposing to demonstrate interference.",
      content: {
        code: `function WaveSuperposition() {
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

    // Superposition
    ctx.beginPath();
    for (var x = 0; x < W; x++) {
      var y = (H * 3/4) + 30 * Math.sin(k1 * x - w1 * t) + 30 * Math.sin(k2 * x - w2 * t);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = col3;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    t += 0.04;
    requestAnimationFrame(step);
  }
  step();
}`,
      },
    }] : []),
  ]).onConflictDoNothing();

  const objectCount = 4 + (facultyOrg ? 1 : 0);
  console.log(`  ${objectCount} KAO objects (2 animations, 1 org animation, 1 dataset, 1 diagram)`);

  // ── 9. Books ──────────────────────────────────────────────────────────────────
  console.log("[seed] Seeding books...");

  // Book 1: Classical Physics (owned by admin, public)
  await db.insert(books).values({
    slug:      "book-classical-physics",
    title:     "Classical Physics",
    ...adminOwner,
  }).onConflictDoNothing();

  // Book 2: Quantum Primer (owned by admin, org-visible)
  await db.insert(books).values({
    slug:      "book-quantum-primer",
    title:     "Quantum Primer",
    ...adminOwner,
  }).onConflictDoNothing();

  // Book 3: Faculty Lectures (owned by faculty org, org-visible)
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
    .where(and(eq(books.ownerType, "user"), eq(books.ownerId, admin.id), eq(books.slug, "book-classical-physics")));

  const [quantumBook] = await db
    .select().from(books)
    .where(and(eq(books.ownerType, "user"), eq(books.ownerId, admin.id), eq(books.slug, "book-quantum-primer")));

  const facultyBook = facultyOrg
    ? (await db.select().from(books).where(and(eq(books.ownerType, "org"), eq(books.ownerId, facultyOrg.id), eq(books.slug, "book-faculty-lectures"))))[0]
    : null;

  // ── Book 1 chapters: Classical Physics (5 chapters) ───────────────────────
  if (classicalBook) {
    const ch1 = [
      { artSlug: "article-newtons-laws",       position: 0, partTitle: "Part I: Mechanics" },
      { artSlug: "article-thermodynamics-laws", position: 1, partTitle: null },
      { artSlug: "article-special-relativity",  position: 2, partTitle: "Part II: Relativity" },
      { artSlug: "article-general-relativity",  position: 3, partTitle: null },
      { artSlug: "article-maxwells-equations",  position: 4, partTitle: "Part III: Electromagnetism" },
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
    console.log("  book-classical-physics: 5 chapters");
  }

  // ── Book 2 chapters: Quantum Primer (3 chapters) ──────────────────────────
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

    // Add dr-feynman's articles as extra chapters
    const feynmanArticles = await db
      .select().from(articles)
      .where(and(
        eq(articles.ownerType, "user"),
        eq(articles.ownerId, feynman?.id ?? -1),
      ));
    const feynmanBySlug = Object.fromEntries(feynmanArticles.map((a) => [a.slug, a]));
    const feynmanChapters = [
      { artSlug: "article-feynman-path-integral", position: 2, partTitle: "Part II: Advanced Topics" },
      { artSlug: "article-qed-overview",          position: 3, partTitle: null },
    ];
    for (const ch of feynmanChapters) {
      const art = feynmanBySlug[ch.artSlug];
      if (art) {
        await db.insert(curriculumEntries).values({
          bookId:    quantumBook.id,
          articleId: art.id,
          position:  ch.position,
          partTitle: ch.partTitle,
        }).onConflictDoNothing();
      }
    }
    console.log("  book-quantum-primer: 4 chapters");
  }

  // ── Book 3 chapters: Faculty Lectures ──────────────────────────────────────
  if (facultyBook && facultyOrg) {
    const facultyArticles = await db
      .select().from(articles)
      .where(and(eq(articles.ownerType, "org"), eq(articles.ownerId, facultyOrg.id)));
    const facBySlug = Object.fromEntries(facultyArticles.map((a) => [a.slug, a]));

    const ch3 = [
      { artSlug: "article-wave-optics", position: 0, partTitle: "Lecture 1" },
      { artSlug: "article-maxwells-equations", position: 1, partTitle: null },
    ];

    for (const ch of ch3) {
      // Wave optics is org-owned; maxwells is admin-owned — both can be in the book
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

  // Private article: article-secret-formula (admin-owned)
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

  // Org-visible book: book-quantum-primer (only faculty org members can see it)
  if (quantumBook) {
    await db.insert(resourceVisibility).values({
      resourceType: "book",
      ...adminOwner,
      resourceKey:  "book-quantum-primer",
      visibility:   "org",
    }).onConflictDoNothing();
    console.log("  book-quantum-primer → org");
  }

  // Org-visible book: book-faculty-lectures (org-owned, org-visible)
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

  // Grant dr-feynman explicit read access to the private article
  if (secretArt && feynman) {
    await db.insert(accessGrants).values({
      resourceType: "article",
      ...adminOwner,
      resourceKey:  "article-secret-formula",
      granteeType:  "user",
      granteeId:    feynman.id,
      grantedBy:    admin.id,
    }).onConflictDoNothing();
    console.log("  grant: dr-feynman → article-secret-formula");
  }

  // NOTE: mit-ocw and quantum-lab have NO grants to the private article
  // This leaves the access-denied path testable for those accounts.

  // ── 12. Article Views ─────────────────────────────────────────────────────────
  console.log("[seed] Seeding article views (50–100 events)...");

  // Only seed views if the table is empty (avoid exponential growth on re-runs)
  const existingViews = await db.select().from(articleViews).limit(1);
  if (existingViews.length === 0) {
    // Define view counts per article to shape the top-5 ranking
    const viewConfig: Array<[string, number]> = [
      ["article-newtons-laws",         22],
      ["article-general-relativity",   18],
      ["article-maxwells-equations",   14],
      ["article-special-relativity",   11],
      ["article-thermodynamics-laws",   9],
      ["article-statistical-mechanics", 6],
      ["article-quantum-mechanics-draft",4],
      ["article-aether-theory",          2],
    ];

    const viewRows: Array<{ articleId: number; viewedAt: Date }> = [];
    for (const [artSlug, count] of viewConfig) {
      const art = artBySlug[artSlug];
      if (!art) continue;
      for (let i = 0; i < count; i++) {
        // Spread views randomly over the last 28 days
        const daysBack = Math.floor(Math.random() * 28);
        const hoursBack = Math.floor(Math.random() * 24);
        viewRows.push({
          articleId: art.id,
          viewedAt: new Date(Date.now() - daysBack * 86_400_000 - hoursBack * 3_600_000),
        });
      }
    }

    // Also add views for feynman-authored articles (use allArtBySlug)
    const feynmanViewConfig: Array<[string, number]> = [
      ["article-feynman-path-integral", 16],
      ["article-qed-overview",          12],
    ];
    for (const [artSlug, count] of feynmanViewConfig) {
      const art = allArtBySlug[artSlug];
      if (!art) continue;
      for (let i = 0; i < count; i++) {
        const daysBack = Math.floor(Math.random() * 28);
        viewRows.push({
          articleId: art.id,
          viewedAt: new Date(Date.now() - daysBack * 86_400_000),
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

  // Apply the Nord preset to the admin user
  const nordPreset = PRESETS.find((p) => p.name === "Nord");
  if (nordPreset && admin) {
    await db.insert(userThemes).values({
      userId:                admin.id,
      lightTokens:           nordPreset.light,
      darkTokens:            nordPreset.dark,
      colorSchemePreference: "system",
    }).onConflictDoNothing();
    console.log("  admin user theme: Nord preset");
  }

  // Apply the Rosé Pine preset to feynman
  const rosePinePreset = PRESETS.find((p) => p.name === "Rosé Pine");
  if (rosePinePreset && feynman) {
    await db.insert(userThemes).values({
      userId:                feynman.id,
      lightTokens:           rosePinePreset.light,
      darkTokens:            rosePinePreset.dark,
      colorSchemePreference: "dark",
    }).onConflictDoNothing();
    console.log("  dr-feynman user theme: Rosé Pine (dark)");
  }

  // ── 14. Book Snapshot ─────────────────────────────────────────────────────────
  console.log("[seed] Seeding book snapshots...");

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
        const ch1entries = [
          { artSlug: "article-newtons-laws",       position: 0, partTitle: "Part I: Mechanics" },
          { artSlug: "article-thermodynamics-laws", position: 1, partTitle: null },
          { artSlug: "article-special-relativity",  position: 2, partTitle: "Part II: Relativity" },
        ];

        for (const entry of ch1entries) {
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

  // ── Summary ────────────────────────────────────────────────────────────────────
  console.log("\n[seed] ✓ Seeding complete!\n");
  console.log("  Users:");
  console.log(`    admin        ${adminEmail}         (isRootAdmin=true,  publisher=principia-official)`);
  console.log(`    dr-feynman   ${viewerEmail}    (isRootAdmin=false, publisher=dr-feynman)`);
  console.log(`    mit-ocw      mit@example.com          (isRootAdmin=false, publisher=mit-ocw)`);
  console.log(`    quantum-lab  quantum@example.com       (isRootAdmin=false, publisher=quantum-lab)`);
  console.log("  Orgs:");
  console.log("    faculty          (super_admin=admin, admin=dr-feynman, member=mit-ocw)");
  console.log("    quantum-institute(super_admin=quantum-lab, member=dr-feynman)");
  console.log("  Articles: 9 admin-owned + 2 feynman + 1 faculty-org");
  console.log("  Books:    book-classical-physics (5ch), book-quantum-primer (4ch), book-faculty-lectures (2ch)");
  console.log("  Objects:  2 animations (admin) + 1 animation (faculty) + 1 dataset + 1 diagram");
  console.log("  Visibility: article-secret-formula=private, book-quantum-primer=org, book-faculty-lectures=org");
  console.log("  Access grant: dr-feynman → article-secret-formula (mit-ocw and quantum-lab denied)");

  process.exit(0);
}

seed().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
