import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

/**
 * Wiring checks: every admin setting that was added must actually change what a customer sees or what an order records.
 * Each test sets a value in the admin screen, then looks at the customer side.
 */
test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3100";
let bankOrder = "";

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

async function fillCheckout(page: Page, o: { name: string; phone: string; city: string; coupon?: string }) {
  await page.getByLabel("Full name").fill(o.name);
  await page.getByLabel("Mobile number").fill(o.phone);
  await page.getByLabel("City").fill(o.city);
  await page.getByLabel("Complete delivery address").fill("House 5, Wiring Street");
  if (o.coupon) await page.locator("#couponCode").fill(o.coupon);
}

async function addToCart(page: Page, slug: string) {
  await page.goto(`/product/${slug}`);
  await page.getByRole("button", { name: "Add to cart" }).first().click();
}

test("a coupon made in the admin form reaches the checkout preview, the order, and its per-customer limit", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/coupons");
  await page.getByLabel("Code", { exact: true }).fill("WIRE200");
  await page.getByLabel("Type").selectOption("fixed");
  await page.locator("#k-value").fill("200");
  await page.getByLabel("Uses per customer").fill("1");
  await page.getByRole("button", { name: "Create coupon" }).click();
  await expect(page.getByText("Coupon created.")).toBeVisible();
  await expect(page.getByRole("row", { name: /WIRE200/ })).toContainText("1 per customer");

  await page.getByLabel("Code", { exact: true }).fill("WIREFREE");
  await page.getByLabel("Type").selectOption("freeship");
  await page.getByRole("button", { name: "Create coupon" }).click();
  await expect(page.getByRole("row", { name: /WIREFREE/ })).toContainText("Free delivery");

  const customer = await (await page.context().browser()!.newContext({ baseURL: BASE })).newPage();
  await addToCart(customer, "demo-earphones"); // Rs. 750 on sale
  await customer.goto("/checkout");
  await fillCheckout(customer, { name: "Wire Customer", phone: "0304 1112221", city: "Lahore", coupon: "wire200" });
  await customer.getByRole("button", { name: "Apply" }).click();
  await expect(customer.getByText(/WIRE200 applied: you save Rs\. 200/)).toBeVisible();
  await expect(customer.getByTestId("coupon-saving")).toContainText("200");
  await expect(customer.getByTestId("order-total")).toContainText("850"); // 750 - 200 + Rs. 300 delivery to Lahore
  await customer.getByLabel(/I have read/).check();
  await customer.getByRole("button", { name: "Place order" }).click();
  await customer.waitForURL(/\/order\/FX-/);
  await expect(customer.getByTestId("order-total")).toContainText("850");
  await expect(customer.getByText("−Rs. 200")).toBeVisible();

  // The same phone number cannot use a one-per-customer coupon again.
  await addToCart(customer, "demo-earphones");
  await customer.goto("/checkout");
  await fillCheckout(customer, { name: "Wire Customer", phone: "0304 1112221", city: "Lahore", coupon: "WIRE200" });
  await customer.getByLabel(/I have read/).check();
  await customer.getByRole("button", { name: "Place order" }).click();
  await expect(customer.getByText(/already used this coupon/)).toBeVisible();

  // Free delivery removes only the delivery fee.
  await customer.locator("#couponCode").fill("WIREFREE");
  await customer.getByRole("button", { name: "Apply" }).click();
  await expect(customer.getByText(/WIREFREE applied: you save Rs\. 300/)).toBeVisible();
  await expect(customer.getByTestId("order-total")).toContainText("750");
});

test("shipping zone settings: duplicate cities are refused, and switching a zone's advance off reaches checkout", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/shipping");
  await expect(page.getByTestId("fallback")).toBeVisible(); // the rule for unlisted cities is stated plainly
  await page.waitForLoadState("networkidle"); // let the page finish starting up before typing, as a person would
  await page.locator("#z0_cities").fill("Kamoki, Lahore"); // Lahore is already in the second zone
  await expect(page.locator("#z0_cities")).toHaveValue("Kamoki, Lahore");
  await page.getByRole("button", { name: "Save delivery settings" }).click();
  await expect(page.getByText(/Lahore is in both/)).toBeVisible();

  await page.goto("/admin/shipping");
  await page.locator('input[name="z0_adv"]').uncheck(); // no advance for the local zone
  await page.getByRole("button", { name: "Save delivery settings" }).click();
  await expect(page.getByText("Delivery settings saved.")).toBeVisible();
  await page.goto("/admin/payments");
  await page.getByTestId("method-cod").getByText("Configure").click();
  await page.getByRole("radio", { name: /One-third/ }).check();
  await page.getByRole("button", { name: "Save advance rule" }).click();
  await expect(page.getByText(/Advance rule saved/)).toBeVisible();

  const customer = await (await page.context().browser()!.newContext({ baseURL: BASE })).newPage();
  await addToCart(customer, "demo-power-bank-10000"); // Rs. 3,500
  await customer.goto("/checkout");
  await customer.getByLabel("City").fill("Kamoki");
  await expect(customer.getByTestId("ship-fee")).not.toHaveText("Enter your city");
  await expect(customer.getByTestId("advance-box")).toHaveCount(0); // switched off for this zone
  await customer.getByLabel("City").fill("Lahore");
  await expect(customer.getByTestId("advance-box")).toBeVisible(); // still on for the other zone
  await customer.close();

  // Put things back so other specs see the defaults.
  await page.goto("/admin/shipping");
  await page.locator('input[name="z0_adv"]').check();
  await page.getByRole("button", { name: "Save delivery settings" }).click();
  await expect(page.getByText("Delivery settings saved.")).toBeVisible();
  await page.goto("/admin/payments");
  await page.getByTestId("method-cod").getByText("Configure").click();
  await page.getByRole("radio", { name: /No advance/ }).check();
  await page.getByRole("button", { name: "Save advance rule" }).click();
  await expect(page.getByText(/Advance turned off/)).toBeVisible();
});

test("bank details saved on the Payments card reach the customer, and saving Store settings does not wipe wallet details", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/payments");
  await page.getByTestId("method-bank").getByText("Configure").click();
  await page.locator("#bankName").fill("Wiring Bank");
  await page.locator("#bankAccountTitle").fill("Fixit Kamoki");
  await page.locator("#bankAccountNumber").fill("PK00WIRE0000000001");
  await page.getByRole("button", { name: "Save bank details" }).click();
  await expect(page.getByText("Bank details saved.")).toBeVisible();
  await expect(page.getByTestId("status-bank")).toHaveText("Active");

  // A wallet is set up, then the full Store settings form is saved: the wallet must survive.
  await page.getByTestId("method-easypaisa").getByText("Configure").click();
  await page.locator("#easypaisa-title").fill("Fixit EP");
  await page.locator("#easypaisa-number").fill("0311 2223334");
  await page.getByRole("button", { name: "Save wallet" }).first().click();
  await page.getByTestId("method-easypaisa").getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByTestId("status-easypaisa")).toHaveText("Active");
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Store settings saved.")).toBeVisible();
  await page.goto("/admin/payments");
  await expect(page.getByTestId("status-easypaisa")).toHaveText("Active");
  await expect(page.getByTestId("status-bank")).toHaveText("Active"); // bank fields are shared with Store settings and survived too

  const customer = await (await page.context().browser()!.newContext({ baseURL: BASE })).newPage();
  await addToCart(customer, "demo-clear-case");
  await customer.goto("/checkout");
  await fillCheckout(customer, { name: "Bank Customer", phone: "0304 1112222", city: "Kamoki" });
  await customer.getByLabel(/Bank transfer/).check();
  await customer.getByLabel(/I have read/).check();
  await customer.getByRole("button", { name: "Place order" }).click();
  await customer.waitForURL(/\/order\/FX-/);
  await expect(customer.getByText("Wiring Bank")).toBeVisible();
  await expect(customer.getByText("PK00WIRE0000000001")).toBeVisible();
  bankOrder = /\/order\/(FX-[A-F0-9]+)/.exec(customer.url())![1];

  // Leave the wallet off for the specs that count payment choices.
  await page.goto("/admin/payments");
  await page.getByTestId("method-easypaisa").getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText(/Easypaisa is now off/)).toBeVisible();
});

test("sale dates set in the product editor decide the price customers see", async ({ page }) => {
  const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const NAME = `Dated Sale ${Date.now()}`;
  await ensureOwnerLogin(page);
  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill(NAME);
  await page.getByRole("tab", { name: "Pricing" }).click();
  await page.getByLabel("Display price (Rs.)", { exact: true }).fill("2000");
  await page.getByLabel("Discount price (Rs.)").fill("1500");
  await page.getByLabel("Sale starts").fill(iso(3)); // not started yet
  await page.getByRole("tab", { name: "Inventory" }).click();
  await page.getByLabel("Stock quantity").fill("5");
  await page.getByRole("tab", { name: "Publishing" }).click();
  await page.getByRole("radio", { name: /Active/ }).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();

  await page.goto(`/shop?q=${encodeURIComponent(NAME)}`);
  const card = page.getByRole("article").filter({ hasText: NAME });
  await expect(card).toContainText("Rs. 2,000");
  await expect(card.getByTestId("percent-off")).toHaveCount(0); // a future sale is not shown or charged

  // Start the sale yesterday: the same product now shows the sale and its calculated percentage.
  await page.goto(`/admin/products?q=${encodeURIComponent(NAME)}`);
  await page.getByRole("link", { name: new RegExp(NAME) }).click();
  await page.getByRole("tab", { name: "Pricing" }).click();
  await page.getByLabel("Sale starts").fill(iso(-1));
  await page.getByLabel("Sale ends").fill(iso(5));
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  await page.goto(`/shop?q=${encodeURIComponent(NAME)}`);
  await expect(page.getByRole("article").filter({ hasText: NAME }).getByTestId("percent-off")).toContainText("25%");

  // An end date before the start date is refused in plain words and keeps the form.
  await page.goto(`/admin/products?q=${encodeURIComponent(NAME)}`);
  await page.getByRole("link", { name: new RegExp(NAME) }).click();
  await page.getByRole("tab", { name: "Pricing" }).click();
  await page.getByLabel("Sale starts").fill(iso(4));
  await page.getByLabel("Sale ends").fill(iso(2));
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "must end after it starts" })).toBeVisible();
});

test("refunds are for managers and owners: staff never see the refund form, the owner does", async ({ page, browser }) => {
  expect(bankOrder).toMatch(/^FX-/);
  await ensureOwnerLogin(page);
  await page.goto(`/admin/orders?q=${bankOrder}`);
  await page.getByRole("link", { name: bankOrder }).click();
  await page.locator("#ps").selectOption("paid"); // the money arrived
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Payment status updated.")).toBeVisible();
  await expect(page.getByLabel("Refund already paid out (Rs.)")).toBeVisible(); // owner

  await page.goto("/admin/users");
  await page.getByLabel("Name").fill("Wiring Staff");
  await page.getByLabel("Email").fill("wiring-staff@example.test");
  await page.getByLabel("Temporary password").fill("Wiring-staff-12345");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Staff account created.")).toBeVisible();

  const staff = await (await browser.newContext({ baseURL: BASE })).newPage();
  await staff.goto("/admin/login");
  await staff.getByLabel("Email").fill("wiring-staff@example.test");
  await staff.getByLabel("Password").fill("Wiring-staff-12345");
  await staff.getByRole("button", { name: "Sign in" }).click();
  await expect(staff.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await staff.goto(`/admin/orders?q=${bankOrder}`);
  await staff.getByRole("link", { name: bankOrder }).click();
  await expect(staff.getByRole("heading", { name: "Items" })).toBeVisible();
  await expect(staff.getByLabel("Refund already paid out (Rs.)")).toHaveCount(0);
});

test("an unverified COD advance is flagged in the orders list and explained on the Track page, and the settings form cannot switch off every payment method", async ({ page, browser }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/payments");
  await page.getByTestId("method-cod").getByText("Configure").click();
  await page.getByRole("radio", { name: /Half/ }).check();
  await page.getByRole("button", { name: "Save advance rule" }).click();
  await expect(page.getByText(/Advance rule saved/)).toBeVisible();

  const customer = await (await browser.newContext({ baseURL: BASE })).newPage();
  await addToCart(customer, "demo-power-bank-10000");
  await customer.goto("/checkout");
  await fillCheckout(customer, { name: "Advance Wiring", phone: "0304 1119998", city: "Lahore" });
  await customer.getByLabel("Cash on delivery").first().check();
  await customer.getByLabel(/I have read/).check();
  await customer.getByRole("button", { name: "Place order" }).click();
  await customer.waitForURL(/\/order\/FX-/);
  const number = /\/order\/(FX-[A-F0-9]+)/.exec(customer.url())![1];

  await page.goto(`/admin/orders?q=${number}`);
  await expect(page.getByTestId("advance-due")).toContainText("advance due");

  // Found by number and phone (no private link): the customer is told where the payment details are.
  await customer.goto("/track");
  await customer.getByLabel("Order number").fill(number);
  await customer.getByLabel("Mobile number").fill("0304 1119998");
  await customer.getByRole("button", { name: "Track order" }).click();
  await expect(customer.getByTestId("pay-hint")).toBeVisible();
  await expect(customer.getByTestId("advance-amount")).toBeVisible();

  // The Store settings form cannot be used to leave customers with no way to pay.
  await page.goto("/admin/settings");
  await page.getByRole("checkbox", { name: /Cash on delivery/ }).uncheck();
  await page.getByRole("checkbox", { name: "Bank transfer", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/Keep at least one payment method on/)).toBeVisible();

  // Put the advance rule back to none.
  await page.goto("/admin/payments");
  await page.getByTestId("method-cod").getByText("Configure").click();
  await page.getByRole("radio", { name: /No advance/ }).check();
  await page.getByRole("button", { name: "Save advance rule" }).click();
  await expect(page.getByText(/Advance turned off/)).toBeVisible();
});
