import { expect, test } from "@playwright/test";

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

test("the homepage says what Fixit sells in a line, offers two clear actions and shows only real sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("accessories and dependable repairs");
  await expect(page.getByRole("link", { name: "Shop now" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book a repair" }).first()).toBeVisible();

  // Offers come from genuinely discounted products (the demo cable is Rs. 600 reduced to Rs. 450).
  await expect(page.getByRole("heading", { name: "Special offers" })).toBeVisible();
  const offers = page.getByRole("region", { name: "Special offers" });
  await expect(offers.getByTestId("percent-off").filter({ hasText: "25%" })).toHaveCount(1); // 600 -> 450, calculated, not typed in

  // "Why" only states things the shop really does. No invented guarantees or reviews.
  const why = page.getByRole("region", { name: "Why shop with Fixit" });
  await expect(why).toContainText("Real stock");
  await expect(why).toContainText("Repairs you approve");
  await expect(why).not.toContainText(/authentic|100%|guarantee|#1|best/i);

  // Category tiles have an icon each.
  const tiles = page.getByRole("region", { name: "Shop by category" }).getByRole("link");
  expect(await tiles.count()).toBeGreaterThan(0);
  expect(await page.getByRole("region", { name: "Shop by category" }).locator("svg").count()).toBeGreaterThanOrEqual(await tiles.count());
});

test("quick view shows the real price and stock and adds to the cart without leaving the page", async ({ page }) => {
  await page.goto("/shop?q=usb-c");
  const card = page.getByRole("article").filter({ hasText: "DEMO USB-C Cable 1m" });
  await expect(card.getByTestId("percent-off")).toContainText("25%");
  await card.getByRole("button", { name: /Quick view/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Rs. 450");
  await expect(dialog).toContainText("Rs. 600"); // the original price, shown only because the discount is real
  await dialog.getByRole("button", { name: "Add to cart" }).click();
  await expect(dialog.getByRole("button", { name: "Added" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/shop/);
  await page.goto("/cart");
  await expect(page.getByText("DEMO USB-C Cable 1m")).toBeVisible();
});

test("a product with finishes sends quick view to the page to choose one, and sold-out items cannot be added", async ({ page }) => {
  await page.goto("/shop?q=braided");
  await page.getByRole("article").filter({ hasText: "DEMO Braided Cable 2m" }).getByRole("button", { name: /Quick view/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "Choose a finish" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/shop?q=protector");
  await page.getByRole("article").filter({ hasText: "DEMO Tempered Glass Protector" }).getByRole("button", { name: /Quick view/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Out of stock" })).toBeDisabled();
});

test("the product photo can be zoomed with a button, which works for touch and keyboard, and closes with Escape", async ({ page }) => {
  await page.goto("/product/demo-stand-silver"); // a demo product that has a photo
  await page.getByRole("button", { name: "Zoom photo" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Zoom photo" })).toBeFocused(); // focus returns to where the user was
});
