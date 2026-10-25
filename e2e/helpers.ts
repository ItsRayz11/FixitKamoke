import { expect, type Page } from "@playwright/test";

export const OWNER = { email: "owner@example.test", password: "Owner-pass-12345" };

/** Signs in as the owner, creating the owner account first if this server has none yet. Safe to call repeatedly. */
export async function ensureOwnerLogin(page: Page) {
  await page.goto("/admin");
  if (/\/admin\/?$/.test(new URL(page.url()).pathname) && (await page.getByRole("heading", { name: "Dashboard" }).count()) > 0) return; // already signed in

  await page.goto("/admin/setup");
  if (await page.getByRole("heading", { name: "Create the owner account" }).count()) {
    await page.getByLabel("Setup token").fill("e2e-setup-token-0123456789");
    await page.getByLabel("Your name").fill("Owner");
    await page.getByLabel("Email").fill(OWNER.email);
    await page.getByLabel("Password").fill(OWNER.password);
    await page.getByRole("button", { name: "Create owner account" }).click();
  } else {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(OWNER.email);
    await page.getByLabel("Password").fill(OWNER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}
