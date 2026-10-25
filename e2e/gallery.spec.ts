import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

// 1x1 transparent PNG, served for the fake image host so tests need no internet.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const stubImages = (page: Page) => page.route("https://img.test/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));

test("a product with several photos shows a gallery that switches photos accessibly", async ({ page }) => {
  await stubImages(page);
  await ensureOwnerLogin(page);
  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill("Gallery Test Item");
  await page.getByLabel("Price (Rs.)", { exact: true }).fill("500");
  await page.getByLabel("Stock quantity").fill("5");
  await page.getByLabel("Image URLs").fill("https://img.test/front.png|Front view\nhttps://img.test/back.png|Back view\nhttps://img.test/side.png|Side view");
  await page.getByLabel(/Published/).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();

  await page.goto("/product/gallery-test-item");
  const main = page.locator("main img").first();
  await expect(main).toHaveAttribute("alt", "Front view");
  const thumbs = page.getByRole("list", { name: "Product photos" }).getByRole("button");
  await expect(thumbs).toHaveCount(3);
  await expect(thumbs.nth(0)).toHaveAttribute("aria-pressed", "true");
  await thumbs.nth(1).click();
  await expect(main).toHaveAttribute("alt", "Back view");
  await expect(thumbs.nth(1)).toHaveAttribute("aria-pressed", "true");
  await thumbs.nth(2).focus();
  await page.keyboard.press("Enter");
  await expect(main).toHaveAttribute("alt", "Side view");

  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t)).flat();
  expect(ld.find((b) => b["@type"] === "Product").image).toHaveLength(3);
});

test("a product with one photo shows no thumbnail strip", async ({ page }) => {
  await stubImages(page);
  await ensureOwnerLogin(page);
  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill("Single Photo Item");
  await page.getByLabel("Price (Rs.)", { exact: true }).fill("300");
  await page.getByLabel("Stock quantity").fill("2");
  await page.getByLabel("Image URLs").fill("https://img.test/only.png|Only photo");
  await page.getByLabel(/Published/).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  await page.goto("/product/single-photo-item");
  await expect(page.locator("main img").first()).toHaveAttribute("alt", "Only photo");
  await expect(page.getByRole("list", { name: "Product photos" })).toHaveCount(0);
});
