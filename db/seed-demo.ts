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
} from "./schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...\n");

  // ── Users ────────────────────────────────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const viewerEmail = process.env.SEED_VIEWER_EMAIL;
  const viewerPassword = process.env.SEED_VIEWER_PASSWORD;

  if (adminEmail && adminPassword) {
    await db.insert(users).values({
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      isAdmin: true,
    }).onConflictDoNothing();
    console.log(`✓ Admin user seeded: ${adminEmail}`);
  } else {
    console.log("⚠ Skipping admin user: SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD not set");
  }

  if (viewerEmail && viewerPassword) {
    await db.insert(users).values({
      email: viewerEmail,
      passwordHash: await bcrypt.hash(viewerPassword, 10),
      isAdmin: false,
    }).onConflictDoNothing();
    console.log(`✓ Viewer user seeded: ${viewerEmail}`);
  } else {
    console.log("⚠ Skipping viewer user: SEED_VIEWER_EMAIL or SEED_VIEWER_PASSWORD not set");
  }

  const adminEmail_ = adminEmail ?? "";
  const viewerEmail_ = viewerEmail ?? "";
  const [admin] = adminEmail_ ? await db.select().from(users).where(eq(users.email, adminEmail_)) : [null];
  const [viewer] = viewerEmail_ ? await db.select().from(users).where(eq(users.email, viewerEmail_)) : [null];

  // ── Categories ───────────────────────────────────────────────────────────────
  await db.insert(categories).values([
    { slug: "physics", name: "Physics" },
    { slug: "mechanics", name: "Classical Mechanics" },
    { slug: "electromagnetism", name: "Electromagnetism" },
  ]).onConflictDoNothing();

  const allCategories = await db.select().from(categories);
  const catBySlug = Object.fromEntries(allCategories.map((c) => [c.slug, c]));
  console.log(`✓ Categories: ${allCategories.length} total`);

  // ── Articles ──────────────────────────────────────────────────────────────────
  await db.insert(articles).values([
    {
      slug: "newtons-laws",
      title: "Newton's Laws of Motion",
      summary:
        "The three fundamental laws that govern the motion of objects in classical mechanics.",
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
    {
      slug: "general-relativity",
      title: "General Relativity",
      summary:
        "Einstein's theory of gravitation, describing gravity as the curvature of spacetime.",
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

General relativity is a geometric theory of gravitation published by Albert Einstein in 1915.

The Einstein field equations relate spacetime curvature to the energy-momentum of matter:

$$G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}$$

## Key Predictions

- Gravitational lensing
- Gravitational waves
- Black holes
- Expansion of the universe`,
    },
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
  ]).onConflictDoNothing();

  const allArticles = await db
    .select()
    .from(articles)
    .where(eq(articles.isInternal, false));
  const artBySlug = Object.fromEntries(allArticles.map((a) => [a.slug, a]));
  console.log(`✓ Articles: ${allArticles.length} total`);

  // ── Article categories ────────────────────────────────────────────────────────
  const categoryLinks: Array<[string, string]> = [
    ["newtons-laws", "mechanics"],
    ["general-relativity", "physics"],
    ["maxwells-equations", "electromagnetism"],
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
  console.log("✓ Article categories linked");

  // ── Revisions ────────────────────────────────────────────────────────────────
  const newtonArticle = artBySlug["newtons-laws"];
  if (newtonArticle) {
    const existing = await db
      .select()
      .from(revisions)
      .where(eq(revisions.articleId, newtonArticle.id));
    if (existing.length === 0) {
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
      ]);
    }
  }
  console.log("✓ Revisions created");

  // ── Curriculum entries ────────────────────────────────────────────────────────
  const classicalBook = { bookSlug: "classical-physics", bookTitle: "Classical Physics" };
  const modernBook = { bookSlug: "modern-physics", bookTitle: "Modern Physics" };

  const curriculumData = [
    { ...classicalBook, slug: "newtons-laws", position: 0, partTitle: "Part I: Mechanics" },
    { ...classicalBook, slug: "maxwells-equations", position: 1, partTitle: "Part II: Electromagnetism" },
    { ...modernBook, slug: "general-relativity", position: 0, partTitle: null },
  ];

  for (const entry of curriculumData) {
    const art = artBySlug[entry.slug];
    if (art) {
      await db
        .insert(curriculumEntries)
        .values({
          bookSlug: entry.bookSlug,
          bookTitle: entry.bookTitle,
          articleId: art.id,
          position: entry.position,
          partTitle: entry.partTitle ?? null,
        })
        .onConflictDoNothing();
    }
  }
  console.log("✓ Curriculum books: classical-physics, modern-physics");

  // ── KAO Objects (including animations) ───────────────────────────────────────
  await db
    .insert(objects)
    .values([
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
  const L = H * 0.55;
  let angle = Math.PI / 3.5;
  let omega = 0;
  const g = 9.8, dt = 0.016;
  let trail = [];

  function tick() {
    const alpha = -(g / L) * Math.sin(angle);
    omega += alpha * dt * 60;
    angle += omega * dt;
    const bobX = pivotX + L * Math.sin(angle);
    const bobY = pivotY + L * Math.cos(angle);
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
    glow.addColorStop(0, '#f5a623');
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

    // Superposition in the middle
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
    ])
    .onConflictDoNothing();
  console.log("✓ KAO objects: pendulum, orbital-mechanics, wave-superposition, spring-animation (animations), periodic-table-sample (dataset), newtonian-mechanics-flow (diagram)");

  // ── Book snapshots ────────────────────────────────────────────────────────────
  const classicalEntries = await db
    .select()
    .from(curriculumEntries)
    .where(eq(curriculumEntries.bookSlug, "classical-physics"));

  if (classicalEntries.length > 0) {
    const existingSnapshot = await db
      .select()
      .from(bookSnapshots)
      .where(eq(bookSnapshots.bookSlug, "classical-physics"));

    if (existingSnapshot.length === 0) {
      const [snap] = await db
        .insert(bookSnapshots)
        .values({
          bookSlug: "classical-physics",
          bookTitle: "Classical Physics",
          note: "Initial seed snapshot",
        })
        .returning();

      for (const entry of classicalEntries) {
        const art = allArticles.find((a) => a.id === entry.articleId);
        if (art) {
          await db.insert(bookSnapshotEntries).values({
            snapshotId: snap.id,
            articleId: art.id,
            articleSlug: art.slug,
            articleTitle: art.title,
            articleContent: art.content,
            position: entry.position,
            partTitle: entry.partTitle ?? null,
          });
        }
      }
      console.log("✓ Book snapshot: classical-physics (1 snapshot, seeded entries)");
    } else {
      console.log("✓ Book snapshot: classical-physics already exists, skipped");
    }
  }

  // ── Organizations ─────────────────────────────────────────────────────────────
  await db
    .insert(organizations)
    .values([
      { slug: "faculty", name: "Faculty Members" },
      { slug: "students", name: "Students" },
    ])
    .onConflictDoNothing();

  const allOrgs = await db.select().from(organizations);
  const orgBySlug = Object.fromEntries(allOrgs.map((o) => [o.slug, o]));
  console.log(`✓ Organizations: ${allOrgs.length} total`);

  // ── Org memberships ───────────────────────────────────────────────────────────
  const facultyOrg = orgBySlug["faculty"];
  const studentsOrg = orgBySlug["students"];

  if (facultyOrg && admin) {
    await db
      .insert(orgMemberships)
      .values({ orgId: facultyOrg.id, userId: admin.id, role: "owner" })
      .onConflictDoNothing();
  }
  if (studentsOrg && viewer) {
    await db
      .insert(orgMemberships)
      .values({ orgId: studentsOrg.id, userId: viewer.id, role: "member" })
      .onConflictDoNothing();
  }
  console.log("✓ Org memberships: admin → faculty (owner), viewer → students (member)");

  // ── Resource visibility ───────────────────────────────────────────────────────
  await db
    .insert(resourceVisibility)
    .values({ resourceType: "book", resourceKey: "modern-physics", isPrivate: true })
    .onConflictDoNothing();
  console.log("✓ Resource visibility: modern-physics set to private");

  // ── Access grants ─────────────────────────────────────────────────────────────
  if (facultyOrg && admin) {
    await db
      .insert(accessGrants)
      .values({
        resourceType: "book",
        resourceKey: "modern-physics",
        granteeType: "org",
        granteeId: facultyOrg.id,
        grantedBy: admin.id,
      })
      .onConflictDoNothing();
  }
  console.log("✓ Access grants: faculty org → modern-physics (book)");

  console.log("\nSeeding complete!");
  console.log("  Admin:  admin@example.com  / <redacted>");
  console.log("  Viewer: viewer@example.com / <redacted>");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
