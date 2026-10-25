import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

let reference = "";
let statusUrl = "";

/** Opens a repair in the admin and waits until the detail page (not the list) is showing. */
async function openRepair(page: Page, ref: string) {
  await page.goto(`/admin/repairs?q=${ref}`);
  await page.getByRole("link", { name: ref }).click();
  await page.waitForURL(/\/admin\/repairs\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Update" })).toBeVisible();
}

test("customer submits a repair request and sees an honest confirmation", async ({ page }) => {
  await page.goto("/repairs");
  await expect(page.getByRole("heading", { name: "Mobile phone repair", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Send repair request" }).click();
  await expect(page.getByText("Please check the highlighted fields.")).toBeVisible();

  await page.getByLabel("Phone brand").fill("Samsung");
  await page.getByLabel("Phone model").fill("Galaxy A54");
  await page.getByLabel("Describe the problem").fill("Screen cracked after a fall, touch still works");
  await page.getByLabel("Your name").fill("Repair Customer");
  await page.getByLabel("Mobile number").fill("12345");
  await page.getByRole("button", { name: "Send repair request" }).click();
  await expect(page.getByText("Please enter a valid Pakistani mobile number.").first()).toBeVisible();
  await page.getByLabel("Mobile number").fill("0300 1112223");
  await page.getByRole("button", { name: "Send repair request" }).click();

  await page.waitForURL(/\/repairs\/status\/RP-/);
  statusUrl = page.url();
  reference = (await page.getByTestId("repair-reference").textContent())!;
  await expect(page.getByTestId("repair-status")).toHaveText("Received");
  await expect(page.getByText("not a booking, a quote or a promise")).toBeVisible();
  await expect(page.getByTestId("repair-price")).toHaveCount(0); // no price is shown before staff set one
});

test("status page needs the secret link or reference + phone", async ({ page }) => {
  await page.goto(statusUrl.split("?")[0]);
  await expect(page.getByText("We could not open that request")).toBeVisible();
  await page.goto("/repairs/track");
  await page.getByLabel("Reference").fill(reference);
  await page.getByLabel("Mobile number").fill("0311 0000000");
  await page.getByRole("button", { name: "Check status" }).click();
  await expect(page.getByText("We could not find a request")).toBeVisible();
  await page.getByLabel("Mobile number").fill("+92 300 1112223");
  await page.getByRole("button", { name: "Check status" }).click();
  await expect(page.getByTestId("repair-reference")).toHaveText(reference);
});

test("staff share an estimate, then a confirmed price; internal notes stay private", async ({ page }) => {
  await ensureOwnerLogin(page);
  await openRepair(page, reference);

  await page.getByLabel("Status").selectOption({ label: "Being reviewed by our team" });
  await page.getByLabel("Internal notes").fill("INTERNAL-ONLY-NOTE");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Repair request updated.")).toBeVisible();

  await page.getByLabel("Status").selectOption({ label: "Estimate shared with you" });
  await page.getByLabel("Price (Rs.)").fill("4500");
  await page.getByLabel("Message shown to the customer").fill("Screen replacement estimate, subject to inspection.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Repair request updated.")).toBeVisible();

  // Estimate shared -> booked is a valid move; the price stays an estimate until staff tick "confirmed".
  await page.getByLabel("Status").selectOption({ label: "Booked in" });
  await page.getByLabel("Price (Rs.)").fill("4500");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Repair request updated.")).toBeVisible();

  await page.goto(statusUrl);
  await expect(page.getByTestId("repair-price")).toContainText("Estimate (not a final price)");
  await expect(page.getByTestId("repair-price")).toContainText("Rs. 4,500");
  await expect(page.getByText("INTERNAL-ONLY-NOTE")).toHaveCount(0);

  await openRepair(page, reference);
  await page.getByLabel("Price (Rs.)").fill("4800");
  await page.getByLabel(/confirmed price/).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Repair request updated.")).toBeVisible();
  await page.goto(statusUrl);
  await expect(page.getByTestId("repair-price")).toContainText("Confirmed price");
  await expect(page.getByTestId("repair-price")).toContainText("Rs. 4,800");
});

test("a confirmed price cannot be set without an amount", async ({ page }) => {
  await ensureOwnerLogin(page);
  await openRepair(page, reference);
  await page.getByLabel("Price (Rs.)").fill("");
  await page.getByLabel(/confirmed price/).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Enter a price before marking it as confirmed.")).toBeVisible();
});
