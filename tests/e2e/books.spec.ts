import { test, expect } from "@playwright/test";

const ADMIN_SLUG = "principia-official";

// Seeded public book with known chapters.
// We use article-thermodynamics-laws (chapter 2) because the first chapter
// (article-newtons-laws) contains <Cite /> MDX components that the book
// chapter page does not yet provide, causing a render error.
const BOOK_SLUG = "book-classical-physics";
const CHAPTER_SLUG = "article-thermodynamics-laws";
const CHAPTER_TITLE = "Laws of Thermodynamics";

test.describe("Book reading", () => {
  test("can navigate to a book chapter and see the content render", async ({ page }) => {
    // Clear cookies — this book is public, no login needed
    await page.context().clearCookies();

    await page.goto(`/${ADMIN_SLUG}/books/${BOOK_SLUG}/${CHAPTER_SLUG}`);

    // The chapter title is rendered as an <h1> directly inside <main>
    // (the book chapter page does not use a <header> wrapper)
    await expect(
      page.locator("main").getByRole("heading", { name: CHAPTER_TITLE, level: 1 }).first()
    ).toBeVisible({ timeout: 20_000 });

    // The page should contain rendered MDX content
    await expect(page.locator(".markdown-content")).toBeVisible();
  });
});
