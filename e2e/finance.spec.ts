import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

const STAFF = { email: "finance-staff@example.test", password: "Staff-pass-12345" };

async function loginAs(page: Page, u: { email: string; password: string }) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("owner works through the whole money side of the shop", async ({ page }) => {
  await ensureOwnerLogin(page);

  // Sidebar has the Finance group
  await page.goto("/admin/finance");
  await expect(page.getByRole("heading", { name: "Financial overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Purchases" }).first()).toBeVisible();

  // Opening balance for the cash drawer
  await page.goto("/admin/finance/accounts");
  await page.locator("#o-a").selectOption({ label: "Cash in hand" });
  await page.locator("#o-m").fill("50000");
  await page.getByRole("button", { name: "Save opening balance" }).click();
  await expect(page.getByText("Opening balance recorded.")).toBeVisible();

  // Supplier
  await page.goto("/admin/finance/suppliers");
  await page.getByLabel("Name").fill("E2E Traders");
  await page.getByRole("button", { name: "Save supplier" }).click();
  await expect(page.getByText("Supplier saved.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Traders" })).toBeVisible();

  // Receive a purchase by the box: stock and cost update
  await page.goto("/admin/finance/purchases");
  await page.getByLabel("Supplier").selectOption({ label: "E2E Traders" });
  await page.locator('select[name="p0"]').selectOption({ index: 1 });
  await page.locator('select[name="t0"]').selectOption("box");
  await page.locator('input[name="q0"]').fill("2");
  await page.locator('input[name="u0"]').fill("6");
  await page.locator('input[name="c0"]').fill("600");
  await page.getByLabel("Transport").fill("120");
  await page.getByLabel("Goods arrived: receive now").check();
  await page.getByLabel("Paid now").fill("500");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByText("Purchase received. Stock and cost are updated.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Rs. 1,320" })).toBeVisible(); // 2 boxes x 600 + 120 transport
  await expect(page.getByText("Rs. 820").first()).toBeVisible(); // still owed

  // Expense
  await page.goto("/admin/finance/expenses");
  await page.getByLabel("Amount (Rs.)").first().fill("4200");
  await page.getByLabel("Details").first().fill("Electricity bill");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText("Expense recorded.")).toBeVisible();

  // Counter sale and a wallet service
  await page.goto("/admin/finance/counter");
  await page.locator('select[name="p0"]').selectOption({ index: 1 });
  await page.locator('input[name="q0"]').fill("1");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText(/^Sale POS-[0-9A-F]{8}: Rs\./)).toBeVisible();
  await page.getByLabel("Amount moved (Rs.)").fill("10000");
  await page.getByLabel("Your fee").fill("1.5");
  await page.getByLabel("Fee type").selectOption("percent");
  await page.getByLabel("Wallet it moves through").selectOption({ label: "JazzCash" });
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("Entry saved.")).toBeVisible();

  // Overview now shows real figures
  await page.goto("/admin/finance");
  await expect(page.getByText("Money on hand")).toBeVisible();
  await expect(page.getByText("You owe suppliers")).toBeVisible();
  await expect(page.getByText("Rs. 820").first()).toBeVisible();

  // Daily closing: close with a difference, then it is final
  await page.goto("/admin/finance/closing");
  await page.getByLabel("Cash you counted (Rs.)").fill("1");
  await page.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByText("Day closed.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Correct this closing (owner)" })).toBeVisible();

  // Reports and exports
  await page.goto("/admin/finance/reports");
  await expect(page.getByRole("heading", { name: "Profit and loss" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Net profit" })).toBeVisible();
  const csv = await page.request.get("/admin/finance/reports/export?report=pnl&format=csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Net profit");
  const xls = await page.request.get("/admin/finance/reports/export?report=sales&format=xls");
  expect(xls.status()).toBe(200);
  expect(await xls.text()).toContain("<Workbook");

  // Inventory shows cost for the owner
  await page.goto("/admin/inventory");
  await expect(page.getByRole("columnheader", { name: "Cost" })).toBeVisible();

  // Create a staff member (counter only by default)
  await page.goto("/admin/users");
  await page.getByLabel("Name").last().fill("Counter Staff");
  await page.getByLabel("Email").last().fill(STAFF.email);
  await page.getByLabel("Temporary password").fill(STAFF.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(STAFF.email).first()).toBeVisible();
});

test("staff can use the counter but cannot see profit, balances or reports, and exports refuse them", async ({ page, context }) => {
  await context.clearCookies();
  await loginAs(page, STAFF);
  await expect(page.getByRole("link", { name: "Shop counter" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Financial overview" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Reports" })).toHaveCount(0);

  await page.goto("/admin/finance/counter");
  await expect(page.getByRole("heading", { name: "Shop counter" })).toBeVisible();

  for (const path of ["/admin/finance", "/admin/finance/accounts", "/admin/finance/reports", "/admin/finance/purchases", "/admin/finance/expenses", "/admin/finance/closing"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/admin\?denied=1|\/admin$/);
  }
  const res = await page.request.get("/admin/finance/reports/export?report=pnl&format=csv");
  expect(res.status()).toBe(403);
  const cash = await page.request.get("/admin/finance/reports/export?report=cash&format=csv");
  expect(cash.status()).toBe(403);
});

test("signed-out visitors cannot download reports or open finance pages", async ({ page, context }) => {
  await context.clearCookies();
  const res = await page.request.get("/admin/finance/reports/export?report=pnl&format=csv", { maxRedirects: 0 });
  expect([307, 308, 401, 403]).toContain(res.status());
  expect(res.headers()["content-type"] ?? "").not.toContain("csv");
  expect(await res.text()).not.toContain("Net profit");
  await page.goto("/admin/finance");
  await expect(page).toHaveURL(/\/admin\/login/);
});
