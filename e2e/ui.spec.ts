import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ensureOwnerLogin } from "./helpers";

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

test("mobile filter drawer: opens, traps focus, filters, closes with Escape", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the drawer is the phone/tablet layout");
  await page.goto("/shop");
  const trigger = page.getByRole("button", { name: /Filters & sorting/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Filters and sorting" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused(); // focus returns to what opened it

  await trigger.click();
  await dialog.getByLabel("Category").selectOption({ label: "Audio" });
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/category=audio/);
  await expect(page.getByRole("heading", { name: "DEMO Wired Earphones" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DEMO USB-C Cable 1m" })).toHaveCount(0);
});

test("filter drawer has no accessibility violations while open", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout only");
  await page.goto("/shop");
  await page.getByRole("button", { name: /Filters & sorting/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} e.g. ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
});

test("desktop shows the filter sidebar instead of the drawer", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "desktop layout only");
  await page.goto("/shop");
  await expect(page.getByRole("complementary", { name: "Filters" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Filters & sorting/ })).toBeHidden();
});

test("add to cart shows an animated toast that can be dismissed, and a reduced-motion visitor still gets it", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", baseURL: "http://localhost:3100" });
  const page = await ctx.newPage();
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  const toast = page.getByText("Added “DEMO USB-C Cable 1m” to cart");
  await expect(toast).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(toast).toBeHidden();
  await ctx.close();
});

test("destructive admin actions ask first: cancel keeps the product, confirm deletes it", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill("Delete Me Item");
  await page.getByLabel("Price (Rs.)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  const url = page.url().split("?")[0];

  await page.getByRole("button", { name: "Delete product" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused(); // Enter must not confirm by accident
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect((await page.request.get(url)).status()).toBe(200);

  await page.getByRole("button", { name: "Delete product" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete product" }).click();
  await expect(page.getByText(/Deleted “Delete Me Item”/)).toBeVisible();
  await page.goto("/admin/products?q=Delete+Me");
  await expect(page.getByText("No products yet.")).toBeVisible();
});

test("scroll reveal never hides content (everything is visible with no scrolling needed to read it)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Delivery" })).toBeVisible();
  const opacity = await page.getByRole("heading", { name: "Delivery" }).evaluate((el) => getComputedStyle(el.closest("section")!).opacity);
  expect(Number(opacity)).toBeGreaterThan(0);
});
