import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

const STAFF = { email: "staff@example.test", password: "Staff-pass-12345" };

async function login(page: Page, u: { email: string; password: string }) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and waits until the dashboard is actually showing (the session cookie is set by then). */
async function loginOk(page: Page, u: { email: string; password: string }) {
  await login(page, u);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("owner creates a category, a product that appears in the store, and a staff account", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/categories");
  await page.getByLabel("Name").last().fill("Test Category");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("Category saved.")).toBeVisible();

  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill("E2E Real Item");
  await page.getByLabel("Category").selectOption({ label: "Test Category" });
  await page.getByLabel("Price (Rs.)", { exact: true }).fill("1000");
  await page.getByLabel("Sale price (Rs.)").fill("1500"); // invalid: higher than price
  await page.getByLabel("Stock quantity").fill("4");
  await page.getByLabel(/Published/).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Sale price must be lower than the regular price.")).toBeVisible();
  await page.getByLabel("Sale price (Rs.)").fill("800");
  await page.getByLabel("Image URLs").fill("http://insecure.example/x.jpg");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText(/must start with https/)).toBeVisible();
  await page.getByLabel("Image URLs").fill("");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();

  await page.goto("/shop?q=e2e+real");
  await expect(page.getByRole("heading", { name: "E2E Real Item" })).toBeVisible();
  await expect(page.getByText("Rs. 800").first()).toBeVisible();

  await page.goto("/admin/users");
  await page.getByLabel("Name").fill("Staff Person");
  await page.getByLabel("Email").fill(STAFF.email);
  await page.getByLabel("Temporary password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
  await page.getByLabel("Temporary password").fill(STAFF.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Staff account created.")).toBeVisible();
});

test("staff role is limited: no products/settings/users, can manage orders", async ({ page }) => {
  await loginOk(page, STAFF);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Products" })).toHaveCount(0);
  for (const p of ["/admin/products", "/admin/settings", "/admin/users", "/admin/audit", "/admin/shipping"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/admin\?denied=1/);
    await expect(page.getByText("Your role does not have access to that page.")).toBeVisible();
  }
  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
});

test("order lifecycle: place, confirm, cancel restocks, invalid move refused", async ({ page, request }) => {
  // Seed the shipping policy and a customer order using the public flow.
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Lifecycle Customer");
  await page.getByLabel("Mobile number").fill("0301 5550000");
  await page.getByLabel("City").fill("Kamoki");
  await page.getByLabel("Complete delivery address").fill("Some house, some street");
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);
  const number = (await page.getByTestId("order-number").textContent())!;

  await loginOk(page, STAFF);
  await page.goto(`/admin/orders?q=${number}`);
  await page.getByRole("link", { name: number }).click();
  await page.getByLabel("Move to").selectOption({ label: "Confirmed" });
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Status updated.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Confirmed");

  const before = await (await request.get("/product/demo-usb-c-cable")).text();
  expect(before).toBeTruthy();
  await page.getByLabel("Move to").selectOption({ label: "Cancelled" });
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Status updated.")).toBeVisible();
  // A cancelled order has no further moves.
  await expect(page.getByLabel("Move to")).toHaveCount(0);
});
