import { expect, test } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

test("an order with an email is queued, the order page still succeeds, and email is reported as unconfigured", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Email Customer");
  await page.getByLabel("Mobile number").fill("0301 2223334");
  await page.getByLabel("Email").fill("queued.customer@example.com");
  await page.getByLabel("City").fill("Kamoki");
  await page.getByLabel("Complete delivery address").fill("House 5, Some Street");
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);
  await expect(page.getByTestId("order-status")).toBeVisible(); // a genuine confirmation page, no "email sent" claim
  await expect(page.getByText(/email (has been )?sent/i)).toHaveCount(0);

  await ensureOwnerLogin(page);
  await page.goto("/admin/email");
  await expect(page.getByText("Email is not configured. Customers are not being emailed.")).toBeVisible();
  await expect(page.getByText("q***@example.com").first()).toBeVisible(); // recipients are masked
  await expect(page.getByText("order received").first()).toBeVisible();
  await page.getByRole("button", { name: "Send queued emails now" }).click();
  await expect(page.getByText("Email is not configured, so nothing was sent.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "pending" }).first()).toBeVisible(); // still queued, not faked as sent
});

test("the cron endpoint is closed unless a secret is configured", async ({ request }) => {
  expect((await request.get("/api/cron/email")).status()).toBe(404);
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});
