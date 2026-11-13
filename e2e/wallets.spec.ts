import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

async function walletOff(page: Page) {
  await ensureOwnerLogin(page);
  await page.goto("/admin/payments");
  if ((await page.getByTestId("status-jazzcash").textContent()) === "Active") {
    await page.getByTestId("method-jazzcash").getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByText(/JazzCash is now off/)).toBeVisible();
  }
}

test.afterAll(async ({ browser }) => {
  await walletOff(await (await browser.newContext({ baseURL: "http://localhost:3100" })).newPage());
});

test("a wallet cannot be switched on without a number, then works end to end", async ({ page, browser }) => {
  await walletOff(page);
  await page.goto("/admin/payments");
  await page.getByTestId("method-jazzcash").getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText(/Add the JazzCash number first/)).toBeVisible();

  // A bad number is refused with a plain message.
  await page.getByTestId("method-jazzcash").getByText("Configure").click();
  await page.locator("#jazzcash-title").fill("Fixit Kamoki");
  await page.locator("#jazzcash-number").fill("not a number");
  await page.getByRole("button", { name: "Save wallet" }).first().click();
  await expect(page.getByText(/digits only/)).toBeVisible();

  await page.getByTestId("method-jazzcash").getByText("Configure").click();
  await page.locator("#jazzcash-title").fill("Fixit Kamoki");
  await page.locator("#jazzcash-number").fill("0300 5550123");
  await page.getByRole("button", { name: "Save wallet" }).first().click();
  await expect(page.getByText("JazzCash details saved.")).toBeVisible();
  await page.getByTestId("method-jazzcash").getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByTestId("status-jazzcash")).toHaveText("Active");

  const customer = await (await browser.newContext({ baseURL: "http://localhost:3100" })).newPage();
  await customer.goto("/product/demo-usb-c-cable");
  await customer.getByRole("button", { name: "Add to cart" }).first().click();
  await customer.goto("/checkout");
  await customer.getByLabel("Full name").fill("Wallet Person");
  await customer.getByLabel("Mobile number").fill("0304 5556669");
  await customer.getByLabel("City").fill("Kamoki");
  await customer.getByLabel("Complete delivery address").fill("House 4, Some Street");
  await customer.getByLabel(/JazzCash transfer/).check();
  await customer.getByLabel(/I have read/).check();
  await customer.getByRole("button", { name: "Place order" }).click();
  await customer.waitForURL(/\/order\/FX-/);
  await expect(customer.getByRole("heading", { name: /How to pay by jazzcash transfer/i })).toBeVisible();
  await expect(customer.getByText("0300 5550123")).toBeVisible();
  await expect(customer.getByText("Fixit Kamoki")).toBeVisible();
  await customer.getByLabel(/Already paid/).fill("JC-E2E-0001");
  await customer.getByRole("button", { name: "Send" }).click();
  await expect(customer.getByText(/We have your reference/)).toBeVisible();
  await expect(customer.getByText(/Payment received/)).toHaveCount(0); // never claimed before staff check
});
