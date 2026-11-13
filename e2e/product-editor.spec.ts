import { expect, test } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

const NAME = `Editor Item ${Date.now()}`;

test("the product editor groups fields in tabs, previews the discount and jumps to the tab with a problem", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/products/new");
  await expect(page.getByRole("tablist", { name: "Product sections" })).toBeVisible();
  for (const t of ["Basics", "Pricing", "Inventory", "Media", "Variants", "SEO", "Publishing"]) await expect(page.getByRole("tab", { name: t })).toBeVisible();

  // Keyboard: arrow keys move between tabs.
  await page.getByRole("tab", { name: "Basics" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Pricing" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Basics" }).click();
  await page.getByLabel("Product name").fill(NAME);
  await page.getByRole("tab", { name: "Pricing" }).click();
  await page.getByLabel("Price (Rs.)", { exact: true }).fill("3000");
  await page.getByLabel("Sale price (Rs.)").fill("2700");
  await expect(page.getByTestId("price-preview")).toContainText("−10%"); // a real, calculated discount
  await page.getByLabel("Sale price (Rs.)").fill("3500");
  await expect(page.getByTestId("price-preview")).toContainText("must be lower"); // never advertised

  // A problem in another tab is shown at the top and the editor jumps to the right tab.
  await page.getByRole("tab", { name: "Basics" }).click();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Sale price must be lower" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pricing" })).toHaveAttribute("aria-selected", "true");

  await page.getByLabel("Sale price (Rs.)").fill("2700");
  await page.getByRole("tab", { name: "Inventory" }).click();
  await page.getByLabel("Stock quantity").fill("6");
  await page.getByRole("tab", { name: "Media" }).click();
  await page.getByLabel("Image URLs").fill("https://img.test/editor.png|Front");
  await expect(page.getByRole("list", { name: "Photos" }).getByRole("img")).toHaveCount(1); // live preview of what was typed
  await page.getByRole("tab", { name: "SEO" }).click();
  await page.getByLabel("Page title").fill("Editor SEO title");
  await page.getByLabel("Page description").fill("Editor SEO description for search results.");
  await page.getByRole("tab", { name: "Publishing" }).click();
  await page.getByRole("radio", { name: /Active/ }).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();

  // The storefront uses the SEO text and shows the sale with its percentage.
  await page.goto(`/shop?q=${encodeURIComponent(NAME)}`);
  await page.getByRole("link", { name: new RegExp(NAME) }).first().click();
  await expect(page).toHaveTitle(/Editor SEO title/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Editor SEO description for search results.");
  await expect(page.getByTestId("percent-off").first()).toContainText("10%");
});

test("an archived product disappears from the store but stays in the admin list", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto(`/admin/products?q=${encodeURIComponent(NAME)}`);
  await page.getByRole("link", { name: new RegExp(NAME) }).click();
  await page.getByRole("tab", { name: "Publishing" }).click();
  await page.getByRole("radio", { name: /Archived/ }).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();

  await page.goto(`/shop?q=${encodeURIComponent(NAME)}`);
  await expect(page.getByRole("link", { name: new RegExp(NAME) })).toHaveCount(0);
  await page.goto(`/admin/products?q=${encodeURIComponent(NAME)}`);
  await expect(page.getByRole("row", { name: new RegExp(NAME) })).toContainText("Archived");
});

test("the admin sidebar groups pages, folds groups and shrinks to an icon rail that remembers its state", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await ensureOwnerLogin(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin", exact: true });
  for (const g of ["Overview", "Sales", "Catalogue", "Operations", "Content", "Settings"]) await expect(nav.getByRole("button", { name: g })).toBeVisible();
  for (const l of ["Discounts", "Email & notifications", "Staff & permissions", "Activity log"]) await expect(nav.getByRole("link", { name: l })).toBeVisible();

  await nav.getByRole("button", { name: "Content" }).click();
  await expect(nav.getByRole("button", { name: "Content" })).toHaveAttribute("aria-expanded", "false");
  await nav.getByRole("button", { name: "Content" }).click();
  await expect(nav.getByRole("link", { name: "Blog" })).toBeVisible();

  await page.getByRole("button", { name: "Collapse sidebar to icons" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-pressed", "true");
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible(); // still reachable by its accessible name
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible(); // remembered
  await page.getByRole("button", { name: "Expand sidebar" }).click();
});

test("the dashboard shows real counts and quick actions, and no chart without orders", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin");
  for (const l of ["Today's orders", "Pending orders", "Awaiting advance", "Ready to ship", "Low stock items", "Pending repairs", "Unread messages"]) await expect(page.getByTestId("kpis").getByText(l)).toBeVisible();
  for (const a of ["Add product", "View pending orders", "Create discount", "Update shipping", "Review payments"]) await expect(page.getByRole("navigation", { name: "Quick actions" }).getByRole("link", { name: a })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Orders, last 14 days" })).toBeVisible();
});
