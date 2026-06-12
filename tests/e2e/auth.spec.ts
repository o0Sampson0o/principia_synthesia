import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

// Credentials seeded by db/seed-demo.ts
const ADMIN_EMAIL = "admin@principia.dev";
const ADMIN_PASSWORD = "1!aA1234567";
const ADMIN_SLUG = "principia-official";

const WRONG_PASSWORD = "wrong-password-xyz";

test.describe("Auth flows", () => {
  test("valid credentials redirect to publisher home", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    // loginAs already waited for navigation away from /login
    await expect(page).toHaveURL(`/${ADMIN_SLUG}`);
  });

  test("wrong password stays on login page with error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(WRONG_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Should redirect back to /login?error=invalid
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/error=invalid/);
    await expect(page.getByText("Invalid email or password")).toBeVisible();
  });

  test("unauthenticated access to /settings redirects to /login", async ({ page }) => {
    // Clear any existing cookies to guarantee unauthenticated state
    await page.context().clearCookies();
    await page.goto("/settings/theme");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
