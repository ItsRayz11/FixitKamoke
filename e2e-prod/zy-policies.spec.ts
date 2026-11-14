import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const OWNER = { email: "owner@prod.test", password: "Prod-owner-pass-123" };

async function loginAs(page: Page, u: { email: string; password: string }) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("owner writes return and warranty policies, picks one per product, and customers see formatted text", async ({ page }) => {
  await loginAs(page, OWNER);

  // --- policies page: several of each kind, one default per kind ---
  await page.goto("/admin/policies");
  await expect(page.getByRole("heading", { name: "Return and warranty policies" })).toBeVisible();
  const add = async (kind: "return" | "warranty", name: string, summary: string, body: string, isDefault: boolean) => {
    await page.waitForLoadState("networkidle"); // let the page finish loading, or typed text can be cleared
    const form = page.locator("form").filter({ has: page.locator(`#n-new-${kind}`) });
    await form.locator(`#n-new-${kind}`).fill(name);
    await form.locator(`#s-new-${kind}`).fill(summary);
    await form.locator(`#b-new-${kind}`).fill(body);
    await expect(form.locator(`#n-new-${kind}`)).toHaveValue(name);
    if (isDefault) await form.getByLabel("Use as the default").check();
    await form.getByRole("button", { name: `Add ${kind} policy` }).click();
    await expect(page.getByText(`${kind === "return" ? "Return" : "Warranty"} policy saved.`)).toBeVisible();
  };
  await add("return", "7-day return", "Return within 7 days if unused.", "## Seven days\n\nBring it back **unused** in its box.\n\n- Keep the receipt", true);
  await add("return", "No return", "Check the item when it arrives.", "No returns on this item. Please check it on delivery.", false);
  await add("warranty", "6-month warranty", "Six months shop warranty.", "## Warranty\n\nWe fix or replace faults for six months.", true);
  await expect(page.getByText("7-day return").first()).toBeVisible();
  await expect(page.getByText("Default").first()).toBeVisible();

  // The default can only sit on one policy per kind: making "No return" the default moves it.
  await page.locator("details").filter({ hasText: "No return" }).first().locator("summary").click();
  const noReturn = page.locator("form").filter({ has: page.locator('input[name="name"][value="No return"]') });
  await noReturn.getByLabel("Use as the default").check();
  await noReturn.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Return policy saved.")).toBeVisible();
  await expect(page.locator("summary", { hasText: "Default" })).toHaveCount(2); // one return + one warranty
  await page.locator("details").filter({ hasText: "7-day return" }).first().locator("summary").click();
  const seven = page.locator("form").filter({ has: page.locator('input[name="name"][value="7-day return"]') });
  await seven.getByLabel("Use as the default").check();
  await seven.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Return policy saved.")).toBeVisible();

  // --- product: markdown description with live preview, policy pickers, and staying on the tab after Save ---
  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill("Policy Test Item");
  await page.locator("#description").fill("## About the item\n\nA **very** useful thing.\n\n- First point\n- Second point");
  await expect(page.getByTestId("description-preview").locator("h2")).toHaveText("About the item");
  await expect(page.getByTestId("description-preview").locator("strong")).toHaveText("very");
  await expect(page.getByTestId("description-preview").locator("li")).toHaveCount(2);
  await page.getByRole("tab", { name: "Pricing" }).click();
  await page.getByLabel("Display price (Rs.)", { exact: true }).fill("1000");
  await page.getByRole("tab", { name: "Publishing" }).click();
  await page.getByLabel("Active").check();
  await page.getByRole("tab", { name: "Inventory" }).click();
  await page.getByLabel("Stock quantity").fill("5");
  await expect(page.getByLabel("Return policy")).toContainText("Default (7-day return)");
  await page.getByLabel("Return policy").selectOption({ label: "No return" });
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  // Still on Inventory, not thrown back to Basics.
  await expect(page).toHaveURL(/tab=inventory/);
  await expect(page.getByRole("tab", { name: "Inventory" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Return policy")).toHaveValue(/.+/);

  // Saving from another tab keeps that tab too.
  await page.getByRole("tab", { name: "Pricing" }).click();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pricing" })).toHaveAttribute("aria-selected", "true");

  // --- customer page: formatted description, chosen return policy, default warranty ---
  await page.goto("/product/policy-test-item");
  const about = page.getByTestId("product-description");
  await expect(about.getByRole("heading", { name: "About the item" })).toBeVisible();
  await expect(about.locator("strong")).toHaveText("very");
  await expect(about.locator("li")).toHaveCount(2);
  await expect(page.locator("main, body").first()).not.toContainText("## About");
  await expect(page.getByText("No return", { exact: true })).toBeVisible();
  await expect(page.getByText("Check the item when it arrives.")).toBeVisible();
  await expect(page.getByText("6-month warranty", { exact: true })).toBeVisible();
  await page.getByText("Read the full warranty policy").click();
  await expect(page.getByText("We fix or replace faults for six months.")).toBeVisible();

  // --- public policy page lists them ---
  await page.goto("/policies/returns");
  await expect(page.getByRole("heading", { name: "7-day return" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No return" })).toBeVisible();
  await page.goto("/policies/warranty");
  await expect(page.getByRole("heading", { name: "6-month warranty" })).toBeVisible();
});
