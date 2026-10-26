import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const NAME = `Alert Item ${stamp}`;
const SLUG = `alert-item-${stamp}`;
const EMAIL = `waiting-${stamp}@example.test`;
const MASKED = "w***@example.test"; // the email-status page masks recipients

test("a sold-out item offers a back-in-stock alert; an in-stock item does not", async ({ page, request }) => {
  await request.post("/api/dev/seed");
  await ensureOwnerLogin(page);
  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill(NAME);
  await page.getByLabel("Price (Rs.)", { exact: true }).fill("1200");
  await page.getByLabel("Stock quantity").fill("0");
  await page.getByLabel(/Published/).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();

  await page.goto(`/product/${SLUG}`);
  const form = page.getByRole("form", { name: /Back in stock alert/ });
  await expect(form).toBeVisible();
  await expect(form).toContainText("delete it within 30 days");

  // Real stock: the in-stock demo item has no alert form.
  await page.goto("/product/demo-usb-c-cable");
  await expect(page.getByRole("button", { name: "Add to cart" }).first()).toBeEnabled();
  await expect(page.getByRole("form", { name: /Back in stock alert/ })).toHaveCount(0);
});

test("the visitor asks for one email and gets an honest confirmation", async ({ page }) => {
  await page.goto(`/product/${SLUG}`);
  const form = page.getByRole("form", { name: /Back in stock alert/ });
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  await form.getByLabel("Email for the back in stock alert").fill(EMAIL);
  await form.getByRole("button", { name: "Notify me" }).click();
  await expect(form.getByRole("status")).toContainText("one email");
});

test("staff see who is waiting, and restocking queues exactly one email", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/inventory");
  const row = page.locator("tr", { hasText: NAME });
  await expect(row).toContainText("1 person");

  await row.getByLabel(`Stock for ${NAME}`).fill("4");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/set to 4/)).toBeVisible();
  await expect(page.locator("tr", { hasText: NAME })).not.toContainText("1 person");

  await page.goto("/admin/email");
  await expect(page.locator("tr", { hasText: "back in stock" }).filter({ hasText: MASKED })).toHaveCount(1);
  // Saving the same stock again must not queue a second message.
  await page.goto("/admin/inventory");
  await page.locator("tr", { hasText: NAME }).getByRole("button", { name: "Save" }).click();
  await page.goto("/admin/email");
  await expect(page.locator("tr", { hasText: "back in stock" }).filter({ hasText: MASKED })).toHaveCount(1);

  await page.goto(`/product/${SLUG}`);
  await expect(page.getByRole("form", { name: /Back in stock alert/ })).toHaveCount(0);
});
