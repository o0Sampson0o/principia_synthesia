import { db } from "./index";
import { articles, categories, articleCategories, users } from "./schema";
import { hashPassword } from "@/lib/auth";

async function seed() {
  const [admin] = await db
    .insert(users)
    .values({
      email: "admin@example.com",
      passwordHash: await hashPassword("admin123"),
      isAdmin: true,
    })
    .returning();

  console.log("Admin user:", admin.email);

  const [physics] = await db
    .insert(categories)
    .values({
      slug: "physics",
      name: "Physics",
    })
    .returning();

  const [article] = await db
    .insert(articles)
    .values({
      slug: "general-relativity",
      title: "General Relativity",
      summary:
        "Einstein's theory of gravitation, describing gravity as curvature of spacetime.",
      content:
        "# General Relativity\n\nGeneral relativity is a geometric theory of gravitation...",
    })
    .returning();

  await db.insert(articleCategories).values({
    articleId: article.id,
    categoryId: physics.id,
  });

  console.log("Seeded!");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
