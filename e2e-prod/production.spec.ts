import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const OWNER = { email: "owner@prod.test", password: "Prod-owner-pass-123" };

async function ownerSignedIn(page: Page) {
  await page.goto("/admin");
  if ((await page.getByRole("heading", { name: "Dashboard" }).count()) > 0) return;
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("production guards: test and seed endpoints do not exist, crawling is allowed, security headers are set", async ({ request }) => {
  expect((await request.post("/api/dev/seed")).status()).toBe(404);
  expect((await request.get("/api/dev/last-reset?email=a@b.co")).status()).toBe(404);
  expect((await request.get("/api/cron/email")).status()).toBe(404); // no CRON_SECRET configured
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toMatch(/Sitemap: http:\/\/localhost:3200\/sitemap\.xml/);
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("SAMEORIGIN");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-powered-by"]).toBeUndefined();
  expect(h["strict-transport-security"]).toContain("max-age=");
  const csp = h["content-security-policy"];
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).not.toMatch(/script-src[^;]*https?:\/\//); // no third-party script origins allowed
  const html = await res.text();
  expect(html).not.toContain("DEMO DATA");
});

test("a brand-new shop shows honest empty states, not fake data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Products are being added.")).toBeVisible();
  await page.goto("/shop");
  await expect(page.getByText("No products have been added yet.")).toBeVisible();
  await page.goto("/contact");
  await expect(page.getByText("The map will appear here once the shop location is confirmed.")).toBeVisible();
  // No delivery zones yet, so an order cannot be placed.
  await page.goto("/policies/shipping");
  await expect(page.getByText("Delivery fees are being set up")).toBeVisible();
});

test("owner setup works on the real database, and cannot be repeated", async ({ page }) => {
  await page.goto("/admin/setup");
  await page.getByLabel("Setup token").fill("prod-smoke-setup-token-0123456789");
  await page.getByLabel("Your name").fill("Prod Owner");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Create owner account" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  expect((await page.goto("/admin/setup"))?.status()).toBe(404);
  const cookies = await page.context().cookies();
  const c = cookies.find((x) => x.name === "fixit_admin")!;
  expect(c.httpOnly).toBe(true);
  expect(c.sameSite).toBe("Lax");
});

test("the owner configures delivery, a category and a product; a guest buys it; stock and totals are right", async ({ page, browser }) => {
  await ownerSignedIn(page);
  await page.goto("/admin/shipping");
  await page.getByLabel("Zone name").first().fill("Kamoki");
  await page.getByLabel("Delivery fee (Rs., 0 = free)").first().fill("0");
  await page.getByLabel("Cities (comma separated)").first().fill("Kamoki");
  await page.getByRole("button", { name: "Save delivery settings" }).click();
  await expect(page.getByText("Delivery settings saved.")).toBeVisible();

  await page.goto("/admin/categories");
  await page.getByLabel("Name").last().fill("Chargers");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("Category saved.")).toBeVisible();

  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill("Prod Test Charger");
  await page.getByLabel("Category").selectOption({ label: "Chargers" });
  await page.getByLabel("Price (Rs.)", { exact: true }).fill("1500");
  await page.getByLabel("Stock quantity").fill("3");
  await page.getByLabel(/Published/).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();

  const guest = await (await browser.newContext({ baseURL: "http://localhost:3200" })).newPage();
  await guest.goto("/product/prod-test-charger");
  await guest.getByRole("button", { name: "Add to cart" }).first().click();
  await guest.goto("/checkout");
  await guest.getByLabel("Full name").fill("Guest Buyer");
  await guest.getByLabel("Mobile number").fill("0300 1234567");
  await guest.getByLabel("City").fill("Kamoki");
  await guest.getByLabel("Complete delivery address").fill("House 1, Some Street");
  await guest.getByLabel(/I have read/).check();
  await expect(guest.getByTestId("order-total")).toHaveText("Rs. 1,500");
  await guest.getByRole("button", { name: "Place order" }).click();
  await guest.waitForURL(/\/order\/FX-/);
  const number = (await guest.getByTestId("order-number").textContent())!;

  await page.goto(`/admin/orders?q=${number}`);
  await expect(page.getByRole("link", { name: number })).toBeVisible();
  await page.goto("/admin/inventory");
  await expect(page.getByRole("row", { name: /Prod Test Charger/ })).toContainText("2"); // 3 - 1
});

test("the sitemap lists the new product and the site is indexable", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("/product/prod-test-charger");
  expect(xml).not.toContain("/admin");
});

test("admin and customer routes are not cacheable and not indexable", async ({ request }) => {
  const r = await request.get("/admin/login");
  expect(r.headers()["x-robots-tag"]).toContain("noindex");
  expect(r.headers()["cache-control"]).toContain("no-store");
});
