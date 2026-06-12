import type { Page } from "@playwright/test";

/**
 * Logs in with the given credentials via the /login page.
 * After a successful login the function waits for the redirect to complete.
 * The caller is responsible for asserting where they ended up.
 */
export async function loginAs(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/login");
  // Wait for the form to be present in the DOM (handles slow SSR hydration)
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for navigation away from /login (redirect on success)
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
}

/**
 * Dismisses the onboarding tour overlay if it is visible.
 * The tour is shown to newly-verified users who haven't completed onboarding.
 */
export async function dismissOnboardingTour(page: Page): Promise<void> {
  const skipButton = page.getByRole("button", { name: "Skip tour" });
  try {
    // Only wait briefly — tour may not be present on every page
    await skipButton.waitFor({ state: "visible", timeout: 3_000 });
    await skipButton.click();
    // Wait for the tour dialog to disappear
    await page.waitForSelector('[role="dialog"]', {
      state: "hidden",
      timeout: 5_000,
    });
  } catch {
    // Tour was not present — nothing to dismiss
  }
}
