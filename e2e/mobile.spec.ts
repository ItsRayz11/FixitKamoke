import { expect, test } from "@playwright/test";

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

for (const path of ["/", "/shop", "/product/demo-usb-c-cable", "/cart", "/checkout", "/track"]) {
  test(`no horizontal overflow on ${path}`, async ({ page }, info) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/shots/${info.project.name}${path.replace(/\//g, "_") || "_home"}.png`, fullPage: true });
  });
}

test("mobile: add to cart shows toast and updates count", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await expect(page.getByText("Added “DEMO USB-C Cable 1m” to cart")).toBeVisible();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
});
