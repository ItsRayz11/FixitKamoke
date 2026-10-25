import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const fill = async (page: Page, city: string, extra: Record<string, string> = {}) => {
  await page.getByLabel("Full name").fill("Test Customer");
  await page.getByLabel("Mobile number").fill(extra.phone ?? "0300 1234567");
  await page.getByLabel("City").fill(city);
  await page.getByLabel("Complete delivery address").fill("House 1, Test Street, Test Area");
  await page.getByLabel(/I have read/).check();
};

test.beforeAll(async ({ request }) => {
  const r = await request.post("/api/dev/seed");
  expect(r.ok()).toBeTruthy();
});

test("browse, search tolerant of case/spacing, and open a product", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Phone repairs");
  await page.goto("/shop?q=USB-C+cable");
  await expect(page.getByRole("heading", { name: "DEMO USB-C Cable 1m" })).toBeVisible();
  await page.goto("/shop?q=usbc");
  await expect(page.getByRole("heading", { name: "DEMO USB-C Cable 1m" })).toBeVisible();
  await page.goto("/shop?q=zzzznothing");
  await expect(page.getByText("No products match your search.")).toBeVisible();
  await page.goto("/shop?q=iphone+13");
  await expect(page.getByRole("heading", { name: "DEMO Clear Phone Case" })).toBeVisible();
  await page.goto("/product/demo-usb-c-cable");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("DEMO USB-C Cable 1m");
  await expect(page.getByText("Rs. 450").first()).toBeVisible();
  await expect(page.getByText("Demo spec")).toBeVisible();
});

test("out-of-stock product cannot be added", async ({ page }) => {
  await page.goto("/product/demo-glass-protector");
  await expect(page.getByRole("button", { name: "Out of stock" })).toBeDisabled();
});

test("cart: add, change quantity, remove, empty state", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await page.goto("/cart");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("Rs. 450");
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("Rs. 900");
  await page.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
});

test("checkout in Kamoki: free delivery, server totals, confirmation, tracking", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await fill(page, "kamoki");
  await expect(page.getByTestId("ship-fee")).toHaveText("Free");
  await expect(page.getByTestId("order-total")).toHaveText("Rs. 450");
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);
  await expect(page.getByTestId("order-total")).toHaveText("Rs. 450");
  await expect(page.getByTestId("order-status")).toHaveText("Received, awaiting confirmation");
  const number = (await page.getByTestId("order-number").textContent())!;
  await expect(page.getByTestId("cart-count")).toHaveText("0");

  // Tracking with the wrong phone must not reveal the order.
  await page.goto("/track");
  await page.getByLabel("Order number").fill(number);
  await page.getByLabel("Mobile number").fill("0311 0000000");
  await page.getByRole("button", { name: "Track order" }).click();
  await expect(page.getByText("We could not find an order")).toBeVisible();
  // Right phone, different formatting, works.
  await page.getByLabel("Mobile number").fill("+92 300 1234567");
  await page.getByRole("button", { name: "Track order" }).click();
  await expect(page.getByTestId("order-number")).toHaveText(number);
});

test("shipping rules: out-of-area fee, unlisted city to be confirmed", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("City").fill("Lahore");
  await expect(page.getByTestId("ship-fee")).toHaveText("Rs. 300");
  await expect(page.getByTestId("order-total")).toHaveText("Rs. 750");
  await page.getByLabel("City").fill("Gwadar");
  await expect(page.getByTestId("ship-fee")).toHaveText("To be confirmed");
  await expect(page.getByText("We will contact you to confirm the delivery fee", { exact: false })).toBeVisible();
});

test("overselling is blocked by the server even when the browser cart is tampered with", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/product/demo-fast-charger-20w"); // stock 3
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.evaluate(async () => {
    const lines = JSON.parse(localStorage.getItem("fixit.cart.v1")!);
    lines[0].quantity = 40;
    localStorage.setItem("fixit.cart.v1", JSON.stringify(lines));
  });
  await page.goto("/checkout");
  await expect(page.getByText("Only 3 available")).toBeVisible();
  await expect(page.getByRole("button", { name: "Place order" })).toBeDisabled();
});

test("unknown product and order links render safe not-found states", async ({ page }) => {
  const res = await page.goto("/product/does-not-exist");
  expect(res?.status()).toBe(404);
  await page.goto("/order/FX-NOPE?t=bad");
  await expect(page.getByText("We could not open that order")).toBeVisible();
});
