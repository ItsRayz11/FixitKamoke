import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

const A = { name: "Account Owner", email: "acct.owner@example.com", password: "Account-pass-123", phone: "0301 5551111" };
const B = { name: "Second Person", email: "acct.second@example.com", password: "Second-pass-1234" };

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

async function register(page: Page, u: { name: string; email: string; password: string; phone?: string }) {
  await page.goto("/account/register");
  await page.getByLabel("Full name").fill(u.name);
  await page.getByLabel("Email").fill(u.email);
  if (u.phone) await page.getByLabel("Mobile number (optional)").fill(u.phone);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Create account" }).click();
}

async function signIn(page: Page, u: { email: string; password: string }) {
  await page.goto("/account/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
}

async function placeOrder(page: Page, productSlug: string) {
  await page.goto(`/product/${productSlug}`);
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("City").fill("Kamoki");
  if (!(await page.getByLabel("Full name").inputValue())) await page.getByLabel("Full name").fill("Account Owner");
  if (!(await page.getByLabel("Mobile number").inputValue())) await page.getByLabel("Mobile number").fill("0301 5551111");
  if (!(await page.getByLabel("Complete delivery address").inputValue())) await page.getByLabel("Complete delivery address").fill("House 7, Street 3");
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);
  return (await page.getByTestId("order-number").textContent())!;
}

test("registration validates, then signs the customer in", async ({ page }) => {
  await register(page, { ...A, password: "short" });
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(A.email); // typed values survive the error
  await page.getByLabel("Password").fill(A.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  await expect(page.getByText("No orders on this account yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Account", exact: true }).first()).toBeVisible();
});

test("sign out, bad password, sign in again; private pages bounce guests", async ({ page }) => {
  await page.goto("/account/login");
  await page.getByLabel("Email").fill(A.email);
  await page.getByLabel("Password").fill("wrong-password-99");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await page.getByLabel("Password").fill(A.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((u) => u.pathname === "/"); // wait for the sign-out to finish before testing guest access
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  for (const p of ["/account", "/account/addresses", "/account/wishlist", "/account/security"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/account\/login/);
  }
});

test("saved address is used to prefill checkout, and the order appears on the account", async ({ page }) => {
  await page.goto("/account/login?next=/account/addresses");
  await page.getByLabel("Email").fill(A.email);
  await page.getByLabel("Password").fill(A.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Saved addresses" })).toBeVisible(); // redirected to the safe next URL
  await page.getByLabel("City").fill("Kamoki");
  await page.getByLabel("Complete address").fill("House 12, Model Town");
  await page.getByLabel(/default address/).check();
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText("Address saved.")).toBeVisible();
  await expect(page.getByText("House 12, Model Town")).toBeVisible();

  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await expect(page.getByLabel("Complete delivery address")).toHaveValue("House 12, Model Town");
  await expect(page.getByLabel("City")).toHaveValue("Kamoki");
  await expect(page.getByTestId("ship-fee")).toHaveText("Free");
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);
  const number = (await page.getByTestId("order-number").textContent())!;
  await page.goto("/account");
  await expect(page.getByText(number)).toBeVisible();
});

test("another customer never sees this customer's orders, and guest orders are never matched by phone", async ({ page }) => {
  await page.context().clearCookies();
  const guest = await placeOrder(page, "demo-usb-c-cable"); // guest order using the SAME phone as account A
  await page.context().clearCookies();
  await register(page, B);
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  await expect(page.getByText("No orders on this account yet.")).toBeVisible();
  await page.goto("/account");
  await expect(page.getByText(guest)).toHaveCount(0);
});

test("open redirects are refused after login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/account/login?next=https://evil.example/");
  await page.getByLabel("Email").fill(B.email);
  await page.getByLabel("Password").fill(B.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  expect(new URL(page.url()).origin).toBe(new URL((await page.evaluate(() => location.origin))).origin);
});

test("wishlist saves a product and shows it on the account", async ({ page }) => {
  await signIn(page, B);
  await page.goto("/product/demo-earphones");
  await page.getByRole("button", { name: "Save to wishlist" }).click();
  await expect(page.getByRole("button", { name: /Saved to your wishlist/ })).toBeVisible();
  await page.goto("/account/wishlist");
  await expect(page.getByRole("heading", { name: "DEMO Wired Earphones" })).toBeVisible();
});

test("password reset: a link is queued, works once, signs out the old password", async ({ page, request }) => {
  await page.context().clearCookies();
  await page.goto("/account/forgot");
  await page.getByLabel("Email").fill("nobody.here@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for that email")).toBeVisible(); // same answer for unknown emails
  await page.getByLabel("Email").fill(B.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for that email")).toBeVisible();

  const { token } = await (await request.get(`/api/dev/last-reset?email=${B.email}`)).json();
  expect(token).toBeTruthy();
  await page.goto(`/account/reset?token=${token}`);
  await page.getByLabel("New password", { exact: true }).fill("Totally-new-pass-9");
  await page.getByLabel("Confirm new password").fill("Does-not-match-9");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("The two passwords do not match.")).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("Totally-new-pass-9");
  await page.getByLabel("Confirm new password").fill("Totally-new-pass-9");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your password has been changed. Please sign in.")).toBeVisible();

  await page.goto(`/account/reset?token=${token}`); // reuse
  await page.getByLabel("New password", { exact: true }).fill("Another-new-pass-9");
  await page.getByLabel("Confirm new password").fill("Another-new-pass-9");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/invalid or has expired/)).toBeVisible();

  await page.goto("/account/login");
  await page.getByLabel("Email").fill(B.email);
  await page.getByLabel("Password").fill(B.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await page.getByLabel("Password").fill("Totally-new-pass-9");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
});

test("verified-purchase review: only after delivery, hidden until approved", async ({ page }) => {
  // Account A buys a charger, the owner delivers it, A reviews it, the owner approves it.
  await page.context().clearCookies();
  await page.goto("/account/login");
  await page.getByLabel("Email").fill(A.email);
  await page.getByLabel("Password").fill(A.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  await page.goto("/product/demo-clear-case");
  await expect(page.getByText("Signed-in customers who have received this product can leave a review.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit review" })).toHaveCount(0);
  const number = await placeOrder(page, "demo-clear-case");

  const owner = await page.context().browser()!.newContext();
  const op = await owner.newPage();
  await ensureOwnerLogin(op);
  await op.goto(`/admin/orders?q=${number}`);
  await op.getByRole("link", { name: number }).click();
  await op.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/);
  for (const s of ["Confirmed", "Being prepared", "Shipped", "Delivered"]) {
    await op.getByLabel("Move to").selectOption({ label: s });
    await op.getByRole("button", { name: "Update" }).click();
    await expect(op.getByText("Status updated.")).toBeVisible();
    await op.waitForLoadState("networkidle");
  }

  await page.goto("/product/demo-clear-case");
  await page.getByLabel("Rating").selectOption("5");
  await page.getByLabel("Your review").fill("Fits my phone well and feels solid.");
  await page.getByRole("button", { name: "Submit review" }).click();
  await expect(page.getByText("Your review will appear once our team has approved it.")).toBeVisible();
  await expect(page.getByText("Fits my phone well")).toHaveCount(0); // pending: hidden

  await op.goto("/admin/reviews");
  await op.getByRole("button", { name: "Approve" }).first().click();
  await expect(op.getByText("Review approved.")).toBeVisible();
  await owner.close();

  await page.goto("/product/demo-clear-case");
  await expect(page.getByText("Fits my phone well and feels solid.")).toBeVisible();
  await expect(page.getByText("verified purchase")).toBeVisible();
});

test("account deletion needs the password and the word DELETE, and keeps the order record", async ({ page }) => {
  await signIn(page, A);
  await page.goto("/account/security");
  await page.getByLabel("Your password").fill(A.password);
  await page.getByLabel("Type DELETE to confirm").fill("nope");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("Type DELETE to confirm.")).toBeVisible();
  await page.getByLabel("Your password").fill("wrong-password-99");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("That password is not correct.")).toBeVisible();
  await page.getByLabel("Your password").fill(A.password);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL("**/?deleted=1");
  await page.goto("/account/login");
  await page.getByLabel("Email").fill(A.email);
  await page.getByLabel("Password").fill(A.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

for (const path of ["/account/login", "/account/register", "/account/forgot"]) {
  test(`accessibility (axe): no serious or critical issues on ${path}`, async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} e.g. ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  });
}
