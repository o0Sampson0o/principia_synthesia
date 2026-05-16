/**
 * db/seed-demo.ts — Demo seed for the redesigned Principia Synthesia
 *
 * Creates:
 *   - A root admin user with publisher slug "principia-official"
 *   - Two viewer users
 *   - An organization (faculty) with memberships
 *   - Sample articles, a book, and KAO objects owned by principia-official
 *   - Basic resource visibility and access grant examples
 *
 * The seed is idempotent — every insert uses onConflictDoNothing() or an
 * existence check, so running it twice does not duplicate rows.
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
} from "./schema";
import type { ArticleMetadataShape } from "./schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

// ── Main seed function ─────────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding database...\n");

  // ── 1. Users ─────────────────────────────────────────────────────────────────
  const adminEmail    = process.env.SEED_ADMIN_EMAIL    ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123456";
  const viewerEmail   = process.env.SEED_VIEWER_EMAIL   ?? "viewer@example.com";
  const viewerPassword = process.env.SEED_VIEWER_PASSWORD ?? "viewer123456";

  // Root admin
  await db.insert(users).values({
    email:        adminEmail,
    passwordHash: await bcrypt.hash(adminPassword, 10),
    isRootAdmin:  true,
    displayName:  "Principia Admin",
    publisherSlug: "principia-official",
  }).onConflictDoNothing();

  // Viewer 1
  await db.insert(users).values({
    email:        viewerEmail,
    passwordHash: await bcrypt.hash(viewerPassword, 10),
    isRootAdmin:  false,
    displayName:  "Viewer One",
    publisherSlug: "viewer-one",
  }).onConflictDoNothing();

  // Viewer 2
  await db.insert(users).values({
    email:        "viewer2@example.com",
    passwordHash: await bcrypt.hash("viewer2-password", 10),
    isRootAdmin:  false,
    displayName:  "Viewer Two",
    publisherSlug: "viewer-two",
  }).onConflictDoNothing();

  const [admin]   = await db.select().from(users).where(eq(users.email, adminEmail));
  const [viewer1] = await db.select().from(users).where(eq(users.email, viewerEmail));
  const [viewer2] = await db.select().from(users).where(eq(users.email, "viewer2@example.com"));

  if (!admin) throw new Error("Admin user not found after insert");
  console.log(`  Admin user: ${admin.email} (id=${admin.id})`);

  // ── 2. Publishers ─────────────────────────────────────────────────────────────
  // Admin publisher
  await db.insert(publishers).values({
    slug:   "principia-official",
    kind:   "user",
    userId: admin.id,
    orgId:  null,
  }).onConflictDoNothing();

  // Viewer publisher slugs
  if (viewer1) {
    await db.insert(publishers).values({
      slug:   "viewer-one",
      kind:   "user",
      userId: viewer1.id,
      orgId:  null,
    }).onConflictDoNothing();
  }
  if (viewer2) {
    await db.insert(publishers).values({
      slug:   "viewer-two",
      kind:   "user",
      userId: viewer2.id,
      orgId:  null,
    }).onConflictDoNothing();
  }
  console.log("  Publishers registered");

  // ── 3. Organization ───────────────────────────────────────────────────────────
  await db.insert(organizations).values({
    slug:          "faculty",
    name:          "Faculty Members",
    publisherSlug: "faculty",
    creatorId:     admin.id,
  }).onConflictDoNothing();

  const [facultyOrg] = await db.select().from(organizations).where(eq(organizations.slug, "faculty"));

  if (facultyOrg) {
    // Register faculty publisher
    await db.insert(publishers).values({
      slug:  "faculty",
      kind:  "org",
      orgId: facultyOrg.id,
    }).onConflictDoNothing();

    // Memberships
    await db.insert(orgMemberships).values({
      orgId:  facultyOrg.id,
      userId: admin.id,
      role:   "super_admin",
    }).onConflictDoNothing();

    if (viewer1) {
      await db.insert(orgMemberships).values({
        orgId:  facultyOrg.id,
        userId: viewer1.id,
        role:   "member",
      }).onConflictDoNothing();
    }
    console.log("  Organization: faculty + memberships");
  }

  // ── 4. Categories ─────────────────────────────────────────────────────────────
  await db.insert(categories).values([
    { slug: "physics",          name: "Physics" },
    { slug: "mechanics",        name: "Classical Mechanics" },
    { slug: "electromagnetism", name: "Electromagnetism" },
    { slug: "relativity",       name: "Relativity" },
  ]).onConflictDoNothing();

  const allCategories = await db.select().from(categories);
  const catBySlug = Object.fromEntries(allCategories.map((c) => [c.slug, c]));
  console.log(`  Categories: ${allCategories.length}`);

  // ── 5. Articles ───────────────────────────────────────────────────────────────
  const ownerType = "user" as const;
  const ownerId   = admin.id;

  const published: ArticleMetadataShape = { status: "published", tags: [], description: "", canvas: null };

  await db.insert(articles).values([
    {
      slug:      "article-newtons-laws",
      title:     "Newton's Laws of Motion",
      summary:   "The three fundamental laws governing classical mechanics.",
      ownerType,
      ownerId,
      metadata: {
        status:      "published",
        tags:        ["mechanics", "classical-physics"],
        description: "Newton's three laws governing motion and forces.",
        canvas:      null,
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["mechanics","classical-physics"]
description: "Newton's three laws governing motion and forces."
canvas: null
---

# Newton's Laws of Motion

## First Law (Law of Inertia)

An object at rest remains at rest, and an object in motion continues in motion, unless acted upon by a net external force.

## Second Law

$$F = ma$$

## Third Law

For every action there is an equal and opposite reaction.`,
    },
    {
      slug:      "article-general-relativity",
      title:     "General Relativity",
      summary:   "Einstein's theory of gravitation.",
      ownerType,
      ownerId,
      metadata: {
        status:      "published",
        tags:        ["relativity", "gravity"],
        description: "Einstein's geometric theory of gravitation.",
        canvas:      null,
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["relativity","gravity"]
description: "Einstein's geometric theory of gravitation."
canvas: null
---

# General Relativity

The Einstein field equations:

$$G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}$$`,
    },
    {
      slug:      "article-maxwells-equations",
      title:     "Maxwell's Equations",
      summary:   "The four fundamental equations of electromagnetism.",
      ownerType,
      ownerId,
      metadata: {
        status:      "published",
        tags:        ["electromagnetism"],
        description: "The four fundamental equations of classical electromagnetism.",
        canvas:      null,
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["electromagnetism"]
description: "The four fundamental equations of classical electromagnetism."
canvas: null
---

# Maxwell's Equations

$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}$$

$$\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}$$`,
    },
    {
      slug:      "article-quantum-mechanics-draft",
      title:     "Quantum Mechanics (Draft)",
      summary:   "Work-in-progress on the Schrödinger equation.",
      ownerType,
      ownerId,
      metadata: {
        status:      "draft",
        tags:        ["quantum"],
        description: "Work-in-progress notes on the Schrödinger equation.",
        canvas:      null,
      } satisfies ArticleMetadataShape,
      content: `---
status: draft
tags: ["quantum"]
description: "Work-in-progress notes on the Schrödinger equation."
canvas: null
---

# Quantum Mechanics (Draft)

The time-dependent Schrödinger equation:

$$i\\hbar \\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi$$`,
    },
    {
      slug:      "article-secret-formula",
      title:     "Secret Formula",
      summary:   "Restricted content — private article.",
      ownerType,
      ownerId,
      metadata: {
        status:      "published",
        tags:        ["secret"],
        description: "Private content for authorized users only.",
        canvas:      null,
      } satisfies ArticleMetadataShape,
      content: `---
status: published
tags: ["secret"]
description: "Private content for authorized users only."
canvas: null
---

# Secret Formula

This article is **private**. Only authorized users can view it.

$$\\Phi = \\oint \\mathbf{B} \\cdot d\\mathbf{A}$$`,
    },
  ]).onConflictDoNothing();

  const allArticles = await db
    .select()
    .from(articles)
    .where(and(eq(articles.ownerType, ownerType), eq(articles.ownerId, ownerId)));
  const artBySlug = Object.fromEntries(allArticles.map((a) => [a.slug, a]));
  console.log(`  Articles: ${allArticles.length}`);

  // ── 6. Article categories ─────────────────────────────────────────────────────
  const categoryLinks: Array<[string, string]> = [
    ["article-newtons-laws",      "mechanics"],
    ["article-newtons-laws",      "physics"],
    ["article-general-relativity","physics"],
    ["article-general-relativity","relativity"],
    ["article-maxwells-equations","electromagnetism"],
  ];

  for (const [artSlug, catSlug] of categoryLinks) {
    const art = artBySlug[artSlug];
    const cat = catBySlug[catSlug];
    if (art && cat) {
      await db.insert(articleCategories).values({
        articleId:  art.id,
        categoryId: cat.id,
      }).onConflictDoNothing();
    }
  }
  console.log("  Article categories linked");

  // ── 7. Revisions ─────────────────────────────────────────────────────────────
  const newtonsArticle = artBySlug["article-newtons-laws"];
  if (newtonsArticle) {
    const existing = await db.select().from(revisions).where(eq(revisions.articleId, newtonsArticle.id));
    if (existing.length === 0) {
      await db.insert(revisions).values([
        { articleId: newtonsArticle.id, content: "# Newton's Laws\n\nFirst draft.", editNote: "Initial draft" },
        { articleId: newtonsArticle.id, content: "# Newton's Laws of Motion\n\n## First Law\n\nAn object at rest stays at rest.\n\n$$F = ma$$", editNote: "Added math" },
      ]);
      console.log("  Revisions: 2 created for article-newtons-laws");
    }
  }

  // ── 8. Book ───────────────────────────────────────────────────────────────────
  await db.insert(books).values({
    slug:      "book-classical-physics",
    title:     "Classical Physics",
    ownerType,
    ownerId,
  }).onConflictDoNothing();

  const [classicalBook] = await db
    .select()
    .from(books)
    .where(and(
      eq(books.ownerType, ownerType),
      eq(books.ownerId, ownerId),
      eq(books.slug, "book-classical-physics"),
    ));

  if (classicalBook) {
    const bookChapters = [
      { artSlug: "article-newtons-laws",      position: 0, partTitle: "Part I: Mechanics" },
      { artSlug: "article-maxwells-equations", position: 1, partTitle: "Part II: Electromagnetism" },
    ];

    for (const ch of bookChapters) {
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
    console.log("  Book: book-classical-physics with 2 chapters");
  }

  // ── 9. KAO Objects ────────────────────────────────────────────────────────────
  await db.insert(objects).values([
    {
      slug:        "anim-pendulum",
      name:        "Simple Pendulum",
      type:        "animation",
      ownerType,
      ownerId,
      description: "A simple pendulum simulation.",
      content: {
        code: `function Pendulum() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 600;
  canvas.height = canvas.offsetHeight || 400;
  const W = canvas.width, H = canvas.height;
  const pivotX = W / 2, pivotY = H * 0.12;
  const L_px = H * 0.55;
  let angle = Math.PI / 3.5, omega = 0;
  const g = 9.8, L = 1.2, dt = 1 / 60;

  function tick() {
    omega += -(g / L) * Math.sin(angle) * dt;
    angle += omega * dt;
    const bobX = pivotX + L_px * Math.sin(angle);
    const bobY = pivotY + L_px * Math.cos(angle);

    ctx.fillStyle = window.theme.background;
    ctx.fillRect(0, 0, W, H);
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bobX, bobY);
    ctx.strokeStyle = window.theme.muted;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bobX, bobY, 18, 0, Math.PI * 2);
    ctx.fillStyle = window.theme.primaryBtn;
    ctx.fill();
    requestAnimationFrame(tick);
  }
  tick();
}`,
      },
    },
    {
      slug:        "object-periodic-table",
      name:        "Periodic Table Sample",
      type:        "dataset",
      ownerType,
      ownerId,
      description: "A small subset of periodic table data.",
      content: {
        headers: ["Element", "Symbol", "Atomic Number"],
        rows: [
          ["Hydrogen", "H", 1],
          ["Helium",   "He", 2],
          ["Carbon",   "C", 6],
        ],
      },
    },
    {
      slug:        "object-force-diagram",
      name:        "Newtonian Mechanics Flow",
      type:        "diagram",
      ownerType,
      ownerId,
      description: "Causal flow from force to position.",
      content: {
        format: "mermaid",
        source: `graph TD
  F[Force F] --> A["Acceleration a = F/m"]
  A --> V["Velocity v = ∫a dt"]
  V --> X["Position x = ∫v dt"]
  M[Mass m] --> A`,
      },
    },
  ]).onConflictDoNothing();
  console.log("  KAO objects: 1 animation, 1 dataset, 1 diagram");

  // ── 10. Resource visibility ───────────────────────────────────────────────────
  const secretArticle = artBySlug["article-secret-formula"];
  if (secretArticle) {
    await db.insert(resourceVisibility).values({
      resourceType: "article",
      ownerType,
      ownerId,
      resourceKey:  "article-secret-formula",
      visibility:   "private",
    }).onConflictDoNothing();
    console.log("  Resource visibility: article-secret-formula set to private");

    // Grant viewer1 access
    if (viewer1) {
      await db.insert(accessGrants).values({
        resourceType: "article",
        ownerType,
        ownerId,
        resourceKey:  "article-secret-formula",
        granteeType:  "user",
        granteeId:    viewer1.id,
        grantedBy:    admin.id,
      }).onConflictDoNothing();
      console.log("  Access grant: viewer1 → article-secret-formula");
    }
  }

  // ── 11. User themes ───────────────────────────────────────────────────────────
  // No custom themes seeded for simplicity — defaults are fine.

  // ── Final summary ─────────────────────────────────────────────────────────────
  console.log("\nSeeding complete!");
  console.log(`  Root admin:  ${adminEmail} (publisher: principia-official)`);
  console.log(`  Viewer 1:    ${viewerEmail} (publisher: viewer-one)`);
  console.log("  Viewer 2:    viewer2@example.com (publisher: viewer-two)");
  console.log("\nDemo content owned by principia-official:");
  console.log("  - Articles: 5 (4 published + 1 draft; 1 private)");
  console.log("  - Book: book-classical-physics (2 chapters)");
  console.log("  - Objects: 1 animation, 1 dataset, 1 diagram");
  console.log("  - Org: faculty (admin=super_admin, viewer1=member)");

  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
