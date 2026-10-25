import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const OWNER = { email: "owner@example.test", password: "Owner-pass-12345" };

async function login(page: Page, u: { email: string; password: string }) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** These scenarios need a brand-new server (no owner yet), so this file sorts first and runs first. */
test("anonymous visitors are bounced from every admin URL", async ({ page, request }) => {
  for (const p of ["/admin", "/admin/products", "/admin/orders", "/admin/settings", "/admin/audit", "/admin/users"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/admin\/login/);
  }
  const res = await request.get("/admin/orders", { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(res.status());
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
});

test("setup rejects a wrong token, then creates the owner once", async ({ page }) => {
  await page.goto("/admin/setup");
  await page.getByLabel("Setup token").fill("wrong-token-wrong-token");
  await page.getByLabel("Your name").fill("Owner");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Create owner account" }).click();
  await expect(page.getByText("Invalid setup token.")).toBeVisible();
  await page.getByLabel("Setup token").fill("e2e-setup-token-0123456789");
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Create owner account" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  // Setup is gone once an owner exists.
  expect((await page.goto("/admin/setup"))?.status()).toBe(404);
});

test("login rejects bad credentials with a generic message", async ({ page }) => {
  await login(page, { email: OWNER.email, password: "totally-wrong-1" });
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await login(page, { email: "nobody@example.test", password: "totally-wrong-1" });
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

