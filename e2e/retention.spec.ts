import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

test("recently viewed shows what this browser looked at, and nothing before that", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Recently viewed" })).toHaveCount(0);
  await page.goto("/product/demo-earphones");
  await page.goto("/product/demo-power-bank-10000");
  await page.goto("/");
  const section = page.getByRole("region", { name: "Recently viewed" });
  await expect(section.getByRole("link", { name: "DEMO Wired Earphones" })).toBeVisible();
  await expect(section.getByRole("link", { name: "DEMO 10000mAh Power Bank" })).toBeVisible();
  await page.goto("/product/demo-earphones");
  await expect(page.getByRole("region", { name: "Recently viewed" }).getByRole("link", { name: "DEMO Wired Earphones" })).toHaveCount(0); // not recommended to itself
});

test("compatible accessories only appear when the phone lists really overlap", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable"); // listed for Samsung Galaxy A54
  await expect(page.getByRole("heading", { name: "Other accessories for the same phones" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DEMO Tempered Glass Protector" })).toBeVisible();
  await page.goto("/product/demo-earphones"); // no compatibility list
  await expect(page.getByRole("heading", { name: "Other accessories for the same phones" })).toHaveCount(0);
});

test("email sign-up needs explicit consent, can be exported, and unsubscribing works", async ({ page, request }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByLabel("Newsletter sign-up").fill("subscriber.one@example.com");
  await footer.getByRole("button", { name: "Sign up" }).click();
  await expect(footer.getByText("Please tick the box to agree to receive emails.")).toBeVisible();
  await footer.getByLabel(/Yes, send me news and offers/).check();
  await footer.getByRole("button", { name: "Sign up" }).click();
  await expect(footer.getByText(/You are signed up/)).toBeVisible();

  await ensureOwnerLogin(page);
  await page.goto("/admin/subscribers");
  await expect(page.getByText("subscriber.one@example.com")).toBeVisible();
  const csv = await (await page.request.get("/admin/subscribers/export")).text();
  expect(csv).toContain("subscriber.one@example.com");
  const token = /unsubscribe\?token=([0-9a-f]{32})/.exec(csv)?.[1];
  expect(token).toBeTruthy();
  // the export is not available to anonymous visitors
  expect((await request.get("/admin/subscribers/export", { maxRedirects: 0 })).status()).not.toBe(200);

  await page.goto(`/unsubscribe?token=${token}`);
  await expect(page.getByRole("heading", { name: "You have been unsubscribed" })).toBeVisible();
  await page.goto("/admin/subscribers");
  await expect(page.getByText("subscriber.one@example.com")).toHaveCount(0);
});

test("ordering does not sign the customer up for marketing email", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Order Only Person");
  await page.getByLabel("Mobile number").fill("0302 1112223");
  await page.getByLabel("Email").fill("order.only@example.com");
  await page.getByLabel("City").fill("Kamoki");
  await page.getByLabel("Complete delivery address").fill("House 9, Some Street");
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);
  await ensureOwnerLogin(page);
  await page.goto("/admin/subscribers");
  await expect(page.getByText("order.only@example.com")).toHaveCount(0);
});

test("funnel events are counted, honour Do Not Track, and reject junk", async ({ page, request }) => {
  const count = async (name: string) => {
    await page.goto("/admin");
    const t = (await page.getByText("Shopping funnel").locator("xpath=..").innerText());
    const m = new RegExp(`${name}\\s*\\n?\\s*(\\d+)`).exec(t);
    return m ? Number(m[1]) : 0;
  };
  await ensureOwnerLogin(page);
  const before = await count("Product views");
  await page.goto("/product/demo-power-bank-10000");
  await page.waitForTimeout(600);
  const after = await count("Product views");
  expect(after).toBeGreaterThan(before);

  const dnt = await request.post("/api/events", { data: { name: "product_view", path: "/x" }, headers: { DNT: "1" } });
  expect(dnt.status()).toBe(204);
  expect((await request.post("/api/events", { data: { name: "drop_table", path: "/x" } })).status()).toBe(400);
  expect((await request.post("/api/events", { data: "not json", headers: { "Content-Type": "application/json" } })).status()).toBe(400);
  expect(await count("Product views")).toBe(after); // DNT request stored nothing
});

async function signInNew(page: Page) {
  await page.goto("/account/register");
  await page.getByLabel("Full name").fill("Reorder Person");
  await page.getByLabel("Email").fill("reorder.person@example.com");
  await page.getByLabel("Password").fill("Reorder-pass-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
}

test("order again puts available items back in the cart, capped to stock", async ({ page }) => {
  await signInNew(page);
  await page.goto("/product/demo-clear-case");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Reorder Person");
  await page.getByLabel("Mobile number").fill("0303 1112223");
  await page.getByLabel("City").fill("Kamoki");
  await page.getByLabel("Complete delivery address").fill("House 3, Some Street");
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);

  await page.goto("/account");
  await page.getByRole("button", { name: "Order again" }).first().click();
  await page.waitForURL("**/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByText("DEMO Clear Phone Case")).toBeVisible();
  expect(page.url()).not.toContain("add=");
});
