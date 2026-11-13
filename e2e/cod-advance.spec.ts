import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

const rupees = (t: string | null) => Number((t ?? "").replace(/[^\d]/g, ""));

async function setRule(page: Page, choice: RegExp, extra?: () => Promise<void>) {
  await ensureOwnerLogin(page);
  await page.goto("/admin/payments");
  await page.getByTestId("method-cod").getByText("Configure").click();
  await page.getByRole("radio", { name: choice }).check();
  if (extra) await extra();
  await page.getByRole("button", { name: "Save advance rule" }).click();
  await expect(page.getByText(/Advance rule saved|Advance turned off/)).toBeVisible();
}

test.afterAll(async ({ browser }) => {
  const page = await (await browser.newContext({ baseURL: "http://localhost:3100" })).newPage();
  await setRule(page, /No advance/);
});

test("with no advance, checkout shows no advance box", async ({ page }) => {
  await setRule(page, /No advance/);
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("City").fill("Kamoki");
  await expect(page.getByTestId("ship-fee")).not.toHaveText("Enter your city");
  await expect(page.getByTestId("advance-box")).toHaveCount(0);
});

test("one-third advance: checkout, order page and admin verification agree to the rupee", async ({ page, browser }) => {
  await setRule(page, /One-third/);
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Advance Person");
  await page.getByLabel("Mobile number").fill("0304 5556668");
  await page.getByLabel("City").fill("Kamoki");
  await page.getByLabel("Complete delivery address").fill("House 3, Some Street");
  await expect(page.getByTestId("advance-box")).toBeVisible();
  const total = rupees(await page.getByTestId("order-total").textContent());
  const now = rupees(await page.getByTestId("advance-now").textContent());
  const later = rupees(await page.getByTestId("advance-later").textContent());
  expect(now).toBe(Math.ceil((total * 3333) / 10000));
  expect(now + later).toBe(total);
  await page.getByLabel("Cash on delivery").first().check();
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);

  // The customer is told what to pay now and later, and nothing claims payment was received.
  await expect(page.getByTestId("advance-amount")).toHaveText(new RegExp(String(now).replace(/(\d)(?=(\d{3})+$)/g, "$1,?")));
  await expect(page.getByRole("heading", { name: /Pay your advance of/ })).toBeVisible();
  await expect(page.getByText("Advance received")).toHaveCount(0);
  const orderUrl = page.url();
  const number = /\/order\/(FX-[A-F0-9]+)/.exec(orderUrl)![1];

  // The customer sends a transaction reference. It does not mark anything paid.
  await page.getByLabel(/Already paid/).fill("TXN-E2E-0001");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/We have your reference/)).toBeVisible();
  await expect(page.getByText("Advance received")).toHaveCount(0);

  // Staff: the order cannot be confirmed before the advance is verified.
  const staff = await (await browser.newContext({ baseURL: "http://localhost:3100" })).newPage();
  await ensureOwnerLogin(staff);
  await staff.goto("/admin/orders");
  await staff.getByRole("link", { name: number }).first().click();
  await expect(staff.getByTestId("next-action")).toContainText("Verify advance");
  await staff.getByLabel("Move to").selectOption({ label: "Confirmed" });
  await staff.getByRole("button", { name: "Update" }).click();
  await expect(staff.getByText(/advance verified before it can be confirmed/)).toBeVisible();

  // Too little is refused; the right amount is accepted and recorded.
  await staff.getByLabel("Amount received (Rs.)").fill(String(now - 1));
  await staff.getByRole("button", { name: "Verify advance" }).click();
  await expect(staff.getByText(/is not enough/)).toBeVisible();
  await staff.getByLabel("Amount received (Rs.)").fill(String(now));
  await staff.getByRole("button", { name: "Verify advance" }).click();
  await expect(staff.getByText("Advance verified and recorded.")).toBeVisible();
  await expect(staff.getByTestId("advance-card")).toContainText("owner@example.test");
  await staff.getByLabel("Move to").selectOption({ label: "Confirmed" });
  await staff.getByRole("button", { name: "Update" }).click();
  await expect(staff.getByText("Status updated.")).toBeVisible();

  // The customer now sees the advance as received.
  await page.reload();
  await expect(page.getByText(/Advance received. Thank you/)).toBeVisible();
  await expect(page.getByTestId("balance-amount")).toBeVisible();
});

test("the admin payments page rejects an invalid custom percentage", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/payments");
  await page.getByTestId("method-cod").getByText("Configure").click();
  await page.getByRole("radio", { name: /Custom percentage/ }).check();
  await page.locator("#percent").fill("150");
  await page.getByRole("button", { name: "Save advance rule" }).click();
  await expect(page.getByText(/between 1 and 100/)).toBeVisible();
});
