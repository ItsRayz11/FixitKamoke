import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

async function openRepair(page: Page, ref: string) {
  await page.goto(`/admin/repairs?q=${ref}`);
  await page.getByRole("link", { name: ref }).click();
  await page.waitForURL(/\/admin\/repairs\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Update" })).toBeVisible();
}

test("a customer approves a price before work starts, and staff cannot skip that step", async ({ page, browser }) => {
  await page.goto("/repairs");
  await expect(page.getByRole("list", { name: "Repair steps" })).toBeVisible(); // the four-step guide
  await page.getByLabel("Phone brand").fill("Xiaomi");
  await page.getByLabel("Phone model").fill("Redmi Note 12");
  await page.getByLabel("Describe the problem").fill("Battery drains in two hours, phone gets hot");
  await page.getByLabel("Your name").fill("Approving Customer");
  await page.getByLabel("Mobile number").fill("0300 7778889");
  await page.getByRole("button", { name: "Send repair request" }).click();
  await page.waitForURL(/\/repairs\/status\/RP-/);
  const ref = (await page.getByTestId("repair-reference").textContent())!;
  await expect(page.getByText("Do you want us to go ahead?")).toHaveCount(0); // no price yet, nothing to approve

  const staff = await (await browser.newContext({ baseURL: "http://localhost:3100" })).newPage();
  await ensureOwnerLogin(staff);
  await openRepair(staff, ref);
  await expect(staff.getByTestId("repair-approval")).toContainText("add a price");
  await staff.getByLabel("Status").selectOption({ label: "Being reviewed by our team" });
  await staff.getByRole("button", { name: "Save changes" }).click();
  await expect(staff.getByText(/saved|updated/i).first()).toBeVisible();
  await staff.getByLabel("Status").selectOption({ label: "Estimate shared with you" });
  await staff.getByLabel("Price (Rs.)").fill("4500");
  await staff.getByRole("button", { name: "Save changes" }).click();
  await expect(staff.getByTestId("repair-approval")).toContainText("Waiting for approval");

  // The customer sees the price and a clear question, labelled as an estimate.
  await page.reload();
  await expect(page.getByText("Do you want us to go ahead?")).toBeVisible();
  await expect(page.getByTestId("approve-amount")).toContainText("4,500");
  await expect(page.getByText(/not a final price/).first()).toBeVisible();

  await page.getByRole("button", { name: /^Approve/ }).click();
  await expect(page.getByText("Thank you. We have your approval and will start the repair.")).toBeVisible();
  await expect(page.getByTestId("repair-status")).toHaveText("Booked in");
  await expect(page.getByTestId("approved-note")).toContainText("4,500");

  await staff.reload();
  await expect(staff.getByTestId("repair-approval")).toContainText("Approved");
  await staff.getByLabel("Status").selectOption({ label: "Repair in progress" });
  await staff.getByRole("button", { name: "Save changes" }).click();
  await expect(staff.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(staff.getByText("Customer approved Rs. 4500")).toBeVisible();
});
