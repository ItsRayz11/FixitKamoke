import { expect, test } from "@playwright/test";

// Runs after production.spec.ts (alphabetical) on the same server, which created the owner, a delivery zone and a product.
test.describe.configure({ mode: "serial" });

const SETUP_TOKEN = "prod-smoke-setup-token-0123456789";

test("no rendered page or response leaks a server secret", async ({ request }) => {
  for (const path of ["/", "/shop", "/product/prod-test-charger", "/contact", "/admin/login", "/checkout", "/sitemap.xml", "/robots.txt"]) {
    const body = await (await request.get(path)).text();
    expect(body, path).not.toContain(SETUP_TOKEN);
    expect(body, path).not.toMatch(/postgres(ql)?:\/\//);
    expect(body, path).not.toMatch(/re_[A-Za-z0-9]{10,}/);
  }
});

test("customer-entered text is treated as text: no script runs, SQL-like input is harmless", async ({ page, browser }) => {
  await page.goto("/product/prod-test-charger");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill('<img src=x onerror="window.__x=1">Evil Name');
  await page.getByLabel("Mobile number").fill("0300 7654321");
  await page.getByLabel("City").fill("Kamoki'; DROP TABLE orders;--");
  await page.getByLabel("Complete delivery address").fill("<script>window.__x=2</script> House 9, Street 1");
  await page.getByLabel("Order notes").fill("</textarea><svg onload=window.__x=3>");
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);
  expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
  await expect(page.getByText("To be confirmed").first()).toBeVisible(); // an unknown "city" is simply an unlisted city
  const number = (await page.getByTestId("order-number").textContent())!;

  // The owner views it in the admin: still just text.
  const ctx = await browser.newContext({ baseURL: "http://localhost:3200" });
  const admin = await ctx.newPage();
  await admin.goto("/admin/login");
  await admin.getByLabel("Email").fill("owner@prod.test");
  await admin.getByLabel("Password").fill("Prod-owner-pass-123");
  await admin.getByRole("button", { name: "Sign in" }).click();
  await expect(admin.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await admin.goto(`/admin/orders?q=${number}`);
  await admin.getByRole("link", { name: number }).click();
  await admin.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/);
  await expect(admin.getByText("<script>window.__x=2</script>", { exact: false })).toBeVisible();
  expect(await admin.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
  await ctx.close();

  // The database is intact: the orders table still exists and answers.
  await page.goto("/track");
  await expect(page.getByRole("heading", { name: "Track your order" })).toBeVisible();
});

test("brute-force protection: repeated wrong sign-ins are throttled (production limits)", async ({ page }) => {
  await page.goto("/admin/login");
  let blocked = false;
  for (let i = 0; i < 12 && !blocked; i++) {
    await page.getByLabel("Email").fill(`attacker${i}@example.com`);
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Incorrect email or password|Too many attempts/ })).toBeVisible();
    blocked = await page.getByText("Too many attempts").isVisible();
  }
  expect(blocked, "the sign-in form must start refusing after repeated failures").toBe(true);
  // Even the correct password is refused while throttled, so guessing cannot continue.
  await page.getByLabel("Email").fill("owner@prod.test");
  await page.getByLabel("Password").fill("Prod-owner-pass-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Too many attempts")).toBeVisible();
});
