import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

async function setPayments(page: Page, o: { cod: boolean; bank: boolean; details?: { name: string; title: string; number: string } }) {
  await ensureOwnerLogin(page);
  await page.goto("/admin/settings");
  const cod = page.getByRole("checkbox", { name: /Cash on delivery/ });
  const bank = page.getByRole("checkbox", { name: "Bank transfer", exact: true });
  await (o.cod ? cod.check() : cod.uncheck());
  await (o.bank ? bank.check() : bank.uncheck());
  await page.getByLabel("Bank name").fill(o.details?.name ?? "");
  await page.getByLabel("Account title").fill(o.details?.title ?? "");
  await page.getByLabel("Account number / IBAN").fill(o.details?.number ?? "");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Store settings saved.")).toBeVisible();
}

async function checkout(page: Page, method: "Cash on delivery" | "Bank transfer") {
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Payment Person");
  await page.getByLabel("Mobile number").fill("0304 5556667");
  await page.getByLabel("City").fill("Kamoki");
  await page.getByLabel("Complete delivery address").fill("House 2, Some Street");
  await page.getByLabel(method, { exact: false }).first().check();
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);
}

test.afterAll(async ({ browser }) => {
  // Leave the shared server the way other specs expect it.
  const page = await (await browser.newContext({ baseURL: "http://localhost:3100" })).newPage();
  await setPayments(page, { cod: true, bank: true });
});

test("the payments page is honest: offline methods work, gateways are off until proven", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/payments");
  await expect(page.getByText("Cash on delivery:")).toBeVisible();
  for (const g of ["JazzCash", "Easypaisa", "Safepay"]) await expect(page.getByText(g).first()).toBeVisible();
  await expect(page.getByText("Not built", { exact: true })).toHaveCount(1); // Easypaisa: its notification format is only given to merchants
  await expect(page.getByText(/not detected automatically/)).toBeVisible(); // honest about manual transfers
  await expect(page.getByText(/Automatic: Safepay sends our server a signed webhook/)).toBeVisible();
});

test("customers are never offered a payment gateway at checkout", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await expect(page.getByRole("radio")).toHaveCount(2);
  for (const name of ["JazzCash", "Easypaisa", "Safepay", "Card"]) await expect(page.getByText(name, { exact: false })).toHaveCount(0);
});

test("switching cash on delivery off leaves bank transfer only, and the owner's bank details reach the confirmation page", async ({ page }) => {
  await setPayments(page, { cod: false, bank: true, details: { name: "Test Bank", title: "Fixit Test", number: "PK00TEST0000000000000001" } });
  await page.context().clearCookies();
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await expect(page.getByRole("radio")).toHaveCount(1);
  await expect(page.getByLabel(/Bank transfer/)).toBeChecked();
  await checkout(page, "Bank transfer");
  await expect(page.getByRole("heading", { name: "How to pay by bank transfer" })).toBeVisible();
  await expect(page.getByText("PK00TEST0000000000000001")).toBeVisible();
  await expect(page.getByText("Your order is only prepared once we have confirmed your payment.")).toBeVisible();
});

test("without saved bank details the customer is told they will be sent, and not shown blank fields", async ({ page }) => {
  await setPayments(page, { cod: true, bank: true });
  await page.context().clearCookies();
  await checkout(page, "Bank transfer");
  await expect(page.getByText("We will send you the account details by message.")).toBeVisible();
  await expect(page.getByText("Account / IBAN")).toHaveCount(0);
});

test("a switched-off method is refused by the server even if the page is stale", async ({ page, context }) => {
  await setPayments(page, { cod: true, bank: true });
  const stale = await context.newPage();
  await stale.goto("/product/demo-usb-c-cable");
  await stale.getByRole("button", { name: "Add to cart" }).first().click();
  await stale.goto("/checkout");
  await stale.getByLabel("Full name").fill("Stale Page");
  await stale.getByLabel("Mobile number").fill("0304 9998887");
  await stale.getByLabel("City").fill("Kamoki");
  await stale.getByLabel("Complete delivery address").fill("House 4, Some Street");
  await stale.getByLabel(/I have read/).check();
  await setPayments(page, { cod: false, bank: true }); // owner disables COD while this page is still open
  await stale.getByRole("button", { name: "Place order" }).click(); // the stale page still has COD selected
  await expect(stale.getByText("That payment method is not available right now.")).toBeVisible();
  await expect(stale).toHaveURL(/\/checkout/);
});
