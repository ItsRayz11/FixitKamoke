import { expect, test } from "@playwright/test";

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

test("cart and checkout show the regular price, the sale saving and the final amount separately", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable"); // Rs. 600 reduced to Rs. 450
  await page.getByRole("button", { name: "Add to cart" }).first().click();

  await page.goto("/cart");
  await expect(page.getByTestId("cart-savings")).toContainText("150");
  await expect(page.getByTestId("cart-subtotal")).toContainText("450");

  await page.goto("/checkout");
  await expect(page.getByTestId("regular-total")).toContainText("600");
  await expect(page.getByTestId("sale-savings")).toContainText("150");
  await page.getByLabel("City").fill("Kamoki");
  await expect(page.getByTestId("order-total")).toContainText("450"); // regular price - sale savings + delivery (free locally)
});

test("an item that is not on sale adds no sale lines", async ({ page }) => {
  await page.goto("/product/demo-clear-case"); // no sale price
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/cart");
  await expect(page.getByTestId("cart-savings")).toHaveCount(0);
  await page.goto("/checkout");
  await expect(page.getByTestId("sale-savings")).toHaveCount(0);
});
