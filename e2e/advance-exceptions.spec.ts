import { expect, test } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });
const BASE = "http://localhost:3100";

test.beforeAll(async ({ request }) => { expect((await request.post("/api/dev/seed")).ok()).toBeTruthy(); });

test("an exception for one product changes the advance shown at checkout, and removing it restores the general rule", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/payments");
  const cod = page.getByTestId("method-cod");
  await cod.getByText("Configure").click();
  await page.getByRole("radio", { name: /Half/ }).check();
  await page.getByRole("button", { name: "Save advance rule" }).click();
  await expect(page.getByText(/Advance rule saved/)).toBeVisible();

  // Exception: the power bank needs no advance.
  await cod.getByText("Configure").click();
  await page.locator("#rule-target").selectOption({ label: "DEMO 10000mAh Power Bank" });
  await page.locator("#rule-mode").selectOption("none");
  await page.getByRole("button", { name: "Save exception" }).click();
  await expect(page.getByText(/Exception saved for DEMO 10000mAh Power Bank/)).toBeVisible();
  await cod.getByText("Configure").click();
  await expect(page.getByTestId("advance-rules")).toContainText("no advance");

  const customer = await (await page.context().browser()!.newContext({ baseURL: BASE })).newPage();
  await customer.goto("/product/demo-power-bank-10000");
  await customer.getByRole("button", { name: /Add to cart/i }).first().click();
  await customer.goto("/checkout");
  await customer.getByLabel("City").fill("Lahore");
  await expect(customer.getByTestId("ship-fee")).not.toHaveText("Enter your city");
  await expect(customer.getByTestId("advance-box")).toHaveCount(0); // the exception means nothing to pay up front

  // Remove the exception: the half-advance returns.
  await page.goto("/admin/payments");
  await cod.getByText("Configure").click();
  await page.getByRole("button", { name: /Remove the exception for DEMO 10000mAh Power Bank/ }).click();
  await expect(page.getByText(/Exception removed/)).toBeVisible();
  await customer.reload();
  await customer.getByLabel("City").fill("Lahore");
  await expect(customer.getByTestId("advance-box")).toBeVisible();
  await customer.close();

  // Put things back.
  await page.goto("/admin/payments");
  await cod.getByText("Configure").click();
  await page.getByRole("radio", { name: /No advance/ }).check();
  await page.getByRole("button", { name: "Save advance rule" }).click();
  await expect(page.getByText(/Advance turned off/)).toBeVisible();
});

// A real 1x1 PNG, so the browser can decode and shrink it exactly like a phone photo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let n = 0;
async function fakeImageHost(page: import("@playwright/test").Page, folder: string) {
  // No real upload leaves the machine: the image host's address is answered locally with a link in the shop's own folder.
  await page.route("https://api.cloudinary.com/**", (route) => route.fulfill({ json: { secure_url: `https://res.cloudinary.com/e2e-cloud/image/upload/v1700000000/fixit/${folder}/e2e${Date.now()}${++n}.jpg` } }));
}

test("a customer attaches pictures to a repair request and staff see them", async ({ page, browser }) => {
  await fakeImageHost(page, "repairs");
  await page.goto("/repairs");
  await page.getByLabel("Phone brand").fill("Samsung");
  await page.getByLabel("Phone model").fill("Galaxy A54");
  await page.getByLabel("Describe the problem").fill("Screen cracked, see the pictures");
  await page.getByLabel("Your name").fill("Photo Customer");
  await page.getByLabel("Mobile number").fill("0300 7770001");
  await page.locator("#repair-photos").setInputFiles([{ name: "a.png", mimeType: "image/png", buffer: PNG }, { name: "b.png", mimeType: "image/png", buffer: PNG }]);
  await expect(page.getByText("Pictures added.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove picture 2" })).toBeVisible();
  await page.getByRole("button", { name: "Remove picture 2" }).click();
  await page.getByRole("button", { name: "Send repair request" }).click();
  await page.waitForURL(/\/repairs\/status\/RP-/);
  await expect(page.getByText("1 picture attached.")).toBeVisible();
  const ref = page.url().match(/RP-[0-9A-F]+/)![0];

  const staff = await (await browser.newContext({ baseURL: BASE })).newPage();
  await ensureOwnerLogin(staff);
  await staff.goto(`/admin/repairs?q=${ref}`);
  await staff.getByRole("link", { name: new RegExp(ref) }).first().click();
  await expect(staff.getByTestId("repair-photos").locator("img")).toHaveCount(1);
  await staff.close();
});

test("a customer attaches a receipt to a bank-transfer order and staff see it, without the order being marked paid", async ({ page, browser }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/payments");
  await page.getByTestId("method-bank").getByText("Configure").click();
  await page.locator("#bankName").fill("Receipt Bank");
  await page.locator("#bankAccountTitle").fill("Fixit Kamoki");
  await page.locator("#bankAccountNumber").fill("PK00RCPT0000000001");
  await page.getByRole("button", { name: "Save bank details" }).click();
  await expect(page.getByText("Bank details saved.")).toBeVisible();

  const customer = await (await browser.newContext({ baseURL: BASE })).newPage();
  await fakeImageHost(customer, "receipts");
  await customer.goto("/product/demo-clear-case");
  await customer.getByRole("button", { name: "Add to cart" }).first().click();
  await customer.goto("/checkout");
  await customer.getByLabel("Full name").fill("Receipt Customer");
  await customer.getByLabel("Mobile number").fill("0304 7770002");
  await customer.getByLabel("City").fill("Kamoki");
  await customer.getByLabel("Complete delivery address").fill("House 9, Receipt Street");
  await customer.getByLabel(/Bank transfer/).check();
  await customer.getByLabel(/I have read/).check();
  await customer.getByRole("button", { name: "Place order" }).click();
  await customer.waitForURL(/\/order\/FX-/);
  const num = customer.url().match(/FX-[0-9A-F]+/)![0];
  await customer.locator("#receipt-file").setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: PNG });
  await expect(customer.getByText("Picture added.")).toBeVisible();
  await customer.getByRole("button", { name: "Send receipt" }).click();
  await expect(customer.getByText(/We have your receipt/)).toBeVisible();
  await expect(customer.getByText(/Payment received/)).toHaveCount(0);

  await page.goto(`/admin/orders?q=${num}`);
  await page.getByRole("link", { name: new RegExp(num) }).first().click();
  await page.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/, { timeout: 60_000 }); // first visit compiles the page
  await expect(page.getByTestId("order-receipts").locator("img")).toHaveCount(1);
  await customer.close();
});
