import { test, expect } from "@playwright/test";
import { loginAs, dismissOnboardingTour } from "./helpers/auth";

const ADMIN_EMAIL = "admin@principia.dev";
const ADMIN_PASSWORD = "1!aA1234567";
const ADMIN_SLUG = "principia-official";

// A seeded public article that has no auth requirement
const PUBLIC_ARTICLE_SLUG = "article-newtons-laws";
const PUBLIC_ARTICLE_TITLE = "Newton's Laws of Motion";

test.describe("Article CRUD", () => {
  test.describe("authenticated as admin", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      // Dismiss the onboarding tour overlay if it appears after login,
      // so subsequent interactions are not blocked.
      await dismissOnboardingTour(page);
    });

    test("can create an article and is redirected to the new article page", async ({ page }) => {
      // Use a unique slug suffix to avoid conflicts on repeated runs
      const suffix = Date.now().toString().slice(-6);
      const fullSlug = `article-e2e-${suffix}`;
      const title = `E2E Test Article ${suffix}`;

      await page.goto(`/${ADMIN_SLUG}/articles/new`);
      await page.waitForSelector('input[name="title"]', { timeout: 10_000 });

      await page.getByLabel("Title").fill(title);
      // The slug input value must be the full slug including the "article-" prefix
      await page.locator('input[name="slug"]').fill(fullSlug);
      await page.getByLabel("Summary").fill("Created by Playwright E2E test");

      await page.getByRole("button", { name: "Publish article" }).click();

      // Should redirect to the new article's page
      await page.waitForURL(`/${ADMIN_SLUG}/articles/${fullSlug}`, {
        timeout: 20_000,
      });
      await expect(
        page.locator("header").getByRole("heading", { name: title })
      ).toBeVisible();
    });

    test("can edit an article and title updates on article page", async ({ page }) => {
      // Navigate to the public seeded article's edit page
      await page.goto(`/${ADMIN_SLUG}/articles/${PUBLIC_ARTICLE_SLUG}/edit`);
      await page.waitForSelector('input[name="title"]', { timeout: 10_000 });

      const newTitle = `Newton's Laws of Motion (E2E Edited)`;
      await page.getByLabel("Title").fill(newTitle);

      await page.getByRole("button", { name: "Save changes" }).click();

      // Should redirect back to the article page
      await page.waitForURL(`/${ADMIN_SLUG}/articles/${PUBLIC_ARTICLE_SLUG}`, {
        timeout: 20_000,
      });
      await expect(
        page.locator("header").getByRole("heading", { name: newTitle })
      ).toBeVisible();

      // Restore the original title so subsequent test runs are clean
      await page.goto(`/${ADMIN_SLUG}/articles/${PUBLIC_ARTICLE_SLUG}/edit`);
      await page.waitForSelector('input[name="title"]', { timeout: 10_000 });
      await page.getByLabel("Title").fill(PUBLIC_ARTICLE_TITLE);
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.waitForURL(`/${ADMIN_SLUG}/articles/${PUBLIC_ARTICLE_SLUG}`, {
        timeout: 20_000,
      });
    });

    test("can delete an article and is redirected to the bin", async ({ page }) => {
      // Create a dedicated article for this delete test
      const suffix = Date.now().toString().slice(-6);
      const fullSlug = `article-del-${suffix}`;
      const title = `Delete Me ${suffix}`;

      await page.goto(`/${ADMIN_SLUG}/articles/new`);
      await page.waitForSelector('input[name="title"]', { timeout: 10_000 });
      await page.getByLabel("Title").fill(title);
      await page.locator('input[name="slug"]').fill(fullSlug);
      await page.getByRole("button", { name: "Publish article" }).click();
      await page.waitForURL(`/${ADMIN_SLUG}/articles/${fullSlug}`, {
        timeout: 20_000,
      });

      // Navigate to edit page to access delete
      await page.goto(`/${ADMIN_SLUG}/articles/${fullSlug}/edit`);
      await page.waitForSelector('input[name="title"]', { timeout: 10_000 });

      // The delete button triggers a window.confirm() dialog — accept it automatically
      page.once("dialog", (dialog) => dialog.accept());

      // Click the delete button inside the Danger Zone section
      await page.getByRole("button", { name: "Delete article" }).click();

      // Should redirect to the bin
      await page.waitForURL(`/${ADMIN_SLUG}/bin`, { timeout: 20_000 });
      await expect(page).toHaveURL(`/${ADMIN_SLUG}/bin`);
    });
  });

  test("public article is visible without login", async ({ page }) => {
    // Clear cookies to guarantee unauthenticated state
    await page.context().clearCookies();
    await page.goto(`/${ADMIN_SLUG}/articles/${PUBLIC_ARTICLE_SLUG}`);
    // The article title appears in the page header (not in the MDX-rendered body)
    await expect(
      page.locator("header").getByRole("heading", { name: PUBLIC_ARTICLE_TITLE })
    ).toBeVisible({ timeout: 15_000 });
  });
});
