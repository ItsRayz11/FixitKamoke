import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

async function moveTo(page: Page, label: string) {
  await page.getByLabel("Move to").selectOption({ label });
  await page.getByRole("button", { name: "Update" }).click();
  // Wait for the heading to show the NEW status: the "Status updated." banner can still be on screen from the previous step.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(label);
}

test("a cash-on-delivery order goes from received to paid, with courier details the customer can see", async ({ page, browser }) => {
  const customer = await (await browser.newContext({ baseURL: "http://localhost:3100" })).newPage();
  await customer.goto("/product/demo-usb-c-cable");
  await customer.getByRole("button", { name: "Add to cart" }).first().click();
  await customer.goto("/checkout");
  await customer.getByLabel("Full name").fill("Fulfil Person");
  await customer.getByLabel("Mobile number").fill("0304 5557771");
  await customer.getByLabel("City").fill("Kamoki");
  await customer.getByLabel("Complete delivery address").fill("House 9, Some Street");
  await customer.getByLabel("Cash on delivery").first().check();
  await customer.getByLabel(/I have read/).check();
  await customer.getByRole("button", { name: "Place order" }).click();
  await customer.waitForURL(/\/order\/FX-/);
  const orderUrl = customer.url();
  const number = /\/order\/(FX-[A-F0-9]+)/.exec(orderUrl)![1];

  await ensureOwnerLogin(page);
  await page.goto("/admin/orders");
  await page.getByRole("link", { name: number }).first().click();
  await expect(page.getByTestId("next-action")).toContainText("confirm the order");
  await moveTo(page, "Confirmed");
  await expect(page.getByTestId("next-action")).toContainText("preparing");
  await moveTo(page, "Being prepared");
  await moveTo(page, "Packed, ready to send");
  await expect(page.getByTestId("next-action")).toContainText("courier");

  await page.getByLabel("Courier", { exact: true }).fill("TCS");
  await page.getByLabel("Tracking number").fill("TCS-778899");
  await page.getByRole("button", { name: "Save courier details" }).click();
  await expect(page.getByText("Courier details saved.")).toBeVisible();
  await moveTo(page, "Shipped");
  await moveTo(page, "Out for delivery");

  // The customer sees where their parcel is, without any staff-only information.
  await customer.reload();
  await expect(customer.getByTestId("tracking-info")).toContainText("TCS-778899");
  await expect(customer.getByTestId("order-status")).toHaveText("Out for delivery");
  await expect(customer.getByText("Call before delivery")).toHaveCount(0);

  await page.getByLabel("Add a note").fill("Call before delivery");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Note added.")).toBeVisible();
  await expect(page.getByText("Call before delivery")).toBeVisible();

  await moveTo(page, "Delivered");
  await expect(page.getByTestId("next-action")).toContainText("cash collected");
  const due = await page.getByLabel("Cash collected on delivery (Rs.)").inputValue();
  await page.getByLabel("Cash collected on delivery (Rs.)").fill(String(Number(due) + 1));
  await page.getByRole("button", { name: "Record cash collected" }).click();
  await expect(page.getByText(/does not match/)).toBeVisible();
  await page.getByLabel("Cash collected on delivery (Rs.)").fill(due);
  await page.getByRole("button", { name: "Record cash collected" }).click();
  await expect(page.getByText("Cash collection recorded. The order is now fully paid.")).toBeVisible();
  await expect(page.getByTestId("received")).toContainText(Number(due).toLocaleString("en-PK"));

  // A refund cannot exceed what was received.
  await page.getByLabel("Refund already paid out (Rs.)").fill(String(Number(due) + 5));
  await page.getByRole("button", { name: "Record refund" }).click();
  await expect(page.getByText(/can still be refunded/)).toBeVisible();
  await page.getByLabel("Refund already paid out (Rs.)").fill("100");
  await page.getByRole("button", { name: "Record refund" }).click();
  await expect(page.getByText("Refund recorded.")).toBeVisible();
  await expect(page.getByTestId("refunded")).toContainText("100");
});
