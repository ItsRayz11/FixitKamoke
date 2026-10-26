import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";
import { jazzcashHash } from "../src/lib/payments/jazzcash";

test.describe.configure({ mode: "serial" });

const SALT = "e2e-integrity-salt-123456"; // matches playwright.config.ts
const BASE = "http://localhost:3100";
let reference = "";
let orderNumber = "";
let paisa = "";

async function fillCheckout(page: Page) {
  await page.getByLabel("Full name").fill("Online Payer");
  await page.getByLabel("Mobile number").fill("0301 5557777");
  await page.getByLabel("City").fill("Kamoki");
  await page.getByLabel("Complete delivery address").fill("House 5, Online Street, Kamoki");
  await page.getByLabel(/I have read/).check();
  await expect(page.getByTestId("ship-fee")).not.toHaveText("Enter your city");
}

/** What JazzCash would post back to the shop for a payment. */
function result(over: Record<string, string> = {}, salt = SALT) {
  const f: Record<string, string> = { pp_TxnRefNo: reference, pp_Amount: paisa, pp_ResponseCode: "000", pp_ResponseMessage: "Thank you", pp_RetreivalReferenceNo: "RR777", ...over };
  return { ...f, pp_SecureHash: jazzcashHash(f, salt) };
}
const post = (page: Page, form: Record<string, string>) => page.request.post(`${BASE}/api/pay/jazzcash/return`, { form, maxRedirects: 0 });

test("the owner starts testing a gateway; customers still cannot see it", async ({ page, request, browser }) => {
  await request.post("/api/dev/seed");
  await ensureOwnerLogin(page);
  await page.goto("/admin/payments");
  const card = page.locator("li", { hasText: "JazzCash (wallet and card)" });
  await expect(card).toContainText("Off");
  await expect(card).toContainText("/api/pay/jazzcash/return");
  await expect(card.getByRole("button", { name: /Go live/ })).toHaveCount(0); // cannot skip the test
  await card.getByRole("button", { name: "Start testing (staff only)" }).click();
  await expect(page.getByText(/is in testing: only signed-in staff/)).toBeVisible();

  const customer = await (await browser.newContext({ baseURL: BASE })).newPage();
  await customer.goto("/product/demo-usb-c-cable");
  await customer.getByRole("button", { name: "Add to cart" }).first().click();
  await customer.goto("/checkout");
  await expect(customer.getByRole("radio")).toHaveCount(2);
  await expect(customer.getByText("JazzCash")).toHaveCount(0);
});

test("staff place a test order: the signed form goes to JazzCash and the order waits", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.route("https://sandbox.jazzcash.com.pk/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>JazzCash sandbox (stub)</body></html>" }));
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await fillCheckout(page);
  await page.getByRole("radio", { name: /Pay with JazzCash/ }).check();
  const sent = page.waitForRequest((r) => r.url().startsWith("https://sandbox.jazzcash.com.pk/") && r.method() === "POST");
  await page.getByRole("button", { name: "Place order and pay" }).click();
  const fields = Object.fromEntries(new URLSearchParams((await sent).postData() ?? ""));

  expect(fields.pp_SecureHash).toBe(jazzcashHash(fields, SALT)); // the form is signed the way JazzCash checks it
  expect(fields.pp_MerchantID).toBe("MC-E2E");
  expect(fields.pp_ReturnURL).toMatch(/\/api\/pay\/jazzcash\/return$/);
  expect(Number(fields.pp_Amount) % 100).toBe(0);
  reference = fields.pp_TxnRefNo;
  paisa = fields.pp_Amount;
  orderNumber = fields.pp_Description.replace("Fixit order ", "");
  expect(orderNumber).toMatch(/^FX-/);

  await page.goto(`/pay/result?ref=${reference}`);
  await expect(page.getByRole("heading", { name: "Confirming your payment…" })).toBeVisible();
  // The customer's browser says nothing that can change the status.
  await page.goto(`/pay/result?ref=${reference}&status=paid&pp_ResponseCode=000`);
  await expect(page.getByRole("heading", { name: "Confirming your payment…" })).toBeVisible();
});

test("forged, altered and wrong-amount results change nothing; the genuine one marks the order paid once", async ({ page }) => {
  await ensureOwnerLogin(page);
  const paidOnAdmin = async () => {
    await page.goto(`/admin/orders?q=${orderNumber}`);
    await page.getByRole("link", { name: orderNumber }).click();
    await expect(page.getByRole("heading", { name: "Payment and delivery" })).toBeVisible();
    return page.getByText("Waiting for the payment provider to confirm payment").count();
  };

  // 1. signed with the wrong salt (a forgery), 2. real hash but a field changed afterwards, 3. correct signature but the wrong amount
  const forged = await post(page, result({}, "attacker-salt"));
  expect(forged.status()).toBe(303);
  expect(forged.headers().location).toContain("/pay/result?error=1");
  const tampered = result();
  const altered = await post(page, { ...tampered, pp_Amount: "100" });
  expect(altered.headers().location).toContain("error=1");
  const short = await post(page, result({ pp_Amount: "100" }));
  expect(short.headers().location).toContain(`ref=${reference}`); // understood, but refused
  expect(await paidOnAdmin()).toBe(1);

  const failed = await post(page, result({ pp_ResponseCode: "157" }));
  expect(failed.status()).toBe(303);
  await page.goto(`/pay/result?ref=${reference}`);
  await expect(page.getByRole("heading", { name: "Payment not completed" })).toBeVisible();

  const ok = await post(page, result());
  expect(ok.headers().location).toContain(`/pay/result?ref=${reference}`);
  await page.goto(`/pay/result?ref=${reference}`);
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  expect(await paidOnAdmin()).toBe(0);
  await expect(page.getByText("Paid online and confirmed by the payment provider")).toBeVisible();
  await expect(page.getByText("RR777")).toBeVisible();

  // a replay, and a later failure message, cannot undo it
  await post(page, result());
  await post(page, result({ pp_ResponseCode: "157" }));
  await page.goto(`/pay/result?ref=${reference}`);
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
});

test("after a verified payment the owner can go live, and customers then see it", async ({ page, browser }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/payments");
  await expect(page.getByText("valid").first()).toBeVisible();
  await expect(page.getByText("REFUSED").first()).toBeVisible(); // the forged attempts are on record
  const card = page.locator("li", { hasText: "JazzCash (wallet and card)" });
  await expect(card).toContainText("Test passed: ready to go live");
  await card.getByRole("button", { name: "Go live for customers" }).click();
  await expect(page.getByText(/is now live for customers/)).toBeVisible();

  const customer = await (await browser.newContext({ baseURL: BASE })).newPage();
  await customer.goto("/product/demo-usb-c-cable");
  await customer.getByRole("button", { name: "Add to cart" }).first().click();
  await customer.goto("/checkout");
  await expect(customer.getByRole("radio", { name: /Pay with JazzCash/ })).toBeVisible();
  await expect(customer.getByText("Online payment becomes available once your city is entered")).toBeVisible();
  await customer.getByLabel("City").fill("Kamoki");
  await expect(customer.getByRole("radio", { name: /Pay with JazzCash/ })).toBeEnabled();

  // restore the shared test server for the other specs
  await card.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByText(/is switched off/)).toBeVisible();
});

test("a customer who paid by transfer sends the transaction ID; staff see it and nothing is marked paid", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Transfer Payer");
  await page.getByLabel("Mobile number").fill("0301 5558888");
  await page.getByLabel("City").fill("Kamoki");
  await page.getByLabel("Complete delivery address").fill("House 6, Transfer Street, Kamoki");
  await page.getByLabel(/Bank transfer/).check();
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);
  const number = (await page.getByTestId("order-number").textContent())!;
  await page.getByLabel("Already paid? Send us the transaction ID").fill("TID-4455-6677");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("We have your reference and will confirm the payment shortly.")).toBeVisible();

  await ensureOwnerLogin(page);
  await page.goto(`/admin/orders?q=${number}`);
  await page.getByRole("link", { name: number }).click();
  await expect(page.getByText("TID-4455-6677")).toBeVisible();
  await expect(page.getByLabel("Payment status")).toHaveValue("pending");
});
