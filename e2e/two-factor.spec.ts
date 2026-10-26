import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ensureOwnerLogin } from "./helpers";
import { base32Decode, hotp, stepAt } from "../src/lib/auth/totp";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const USER = { email: `twofa-${stamp}@example.test`, password: "Twofa-pass-12345", name: "Two Step Person" };
let secret = "";
let recovery: string[] = [];

/** The code the app would show, offset by whole 30-second steps (+1 is accepted and is never the step used in setup). */
const code = (offset = 0) => hotp(base32Decode(secret), stepAt() + offset);

/** The newest 30-second step already spent. A real authenticator shows a new code every step, and a spent code is refused. */
let lastStep = -1;
async function nextCode(page: Page) {
  for (;;) {
    const now = stepAt();
    const step = [now - 1, now, now + 1].find((s) => s > lastStep);
    if (step !== undefined) { lastStep = step; return hotp(base32Decode(secret), step); }
    await page.waitForTimeout(1000); // wait for the app to show a fresh code
  }
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
}
async function password(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(USER.email);
  await page.getByLabel("Password").fill(USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("the owner creates a staff account, who turns on two-step sign-in", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/users");
  await page.getByLabel("Name").fill(USER.name);
  await page.getByLabel("Email").fill(USER.email);
  await page.getByLabel("Temporary password").fill(USER.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Staff account created.")).toBeVisible();
  await signOut(page);

  await password(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible(); // no second step yet
  await page.goto("/admin/security");
  await expect(page.getByRole("heading", { name: "Account security" })).toBeVisible();
  await page.getByRole("button", { name: "Start setup" }).click();
  await expect(page.getByRole("heading", { name: "Finish setting up" })).toBeVisible();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  secret = (await page.getByTestId("totp-secret").textContent())!.replace(/\s/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await expect(page.getByRole("link", { name: "Open in authenticator app" })).toHaveAttribute("href", /^otpauth:\/\/totp\/Fixit:/);

  await page.getByLabel("6-digit code from the app").fill("000000");
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await expect(page.getByText("That code is not right")).toBeVisible();

  await page.getByLabel("6-digit code from the app").fill(await nextCode(page));
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await expect(page.getByText("They will not be shown again.")).toBeVisible();
  recovery = await page.getByTestId("recovery-codes").locator("li").allTextContents();
  expect(recovery).toHaveLength(10);
  await page.getByRole("link", { name: "I have saved them" }).click();
  await expect(page.getByText(/On since/)).toBeVisible();
  await expect(page.getByText("10 recovery codes left")).toBeVisible();
});

test("a password alone no longer signs in; a wrong code is refused; the right code works", async ({ page }) => {
  await password(page);
  await expect(page).toHaveURL(/\/admin\/login\/verify/);
  await expect(page.getByRole("heading", { name: "Check it's you" })).toBeVisible();
  // Being on the verify page grants nothing.
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/admin\/login/);

  await password(page);
  await page.getByLabel("Code from your authenticator app").fill("123456");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByText("That code is not right")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login\/verify/);

  await page.getByLabel("Code from your authenticator app").fill(await nextCode(page));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await signOut(page);
});

test("a recovery code works once", async ({ page }) => {
  await password(page);
  await page.getByLabel("Code from your authenticator app").fill(recovery[0]);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.goto("/admin/security");
  await expect(page.getByText("9 recovery codes left")).toBeVisible();
  await signOut(page);

  await password(page);
  await page.getByLabel("Code from your authenticator app").fill(recovery[0]); // already used
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByText("That code is not right")).toBeVisible();
});

test("five wrong codes end the attempt and the person must start again", async ({ page }) => {
  await password(page);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Code from your authenticator app").fill(`11111${i}`);
    // Wait for the server's answer each time, so one attempt is counted per click.
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/login/verify")),
      page.getByRole("button", { name: "Verify and sign in" }).click(),
    ]);
  }
  await expect(page).toHaveURL(/\/admin\/login\?notice=locked/);
  await expect(page.getByText("Too many wrong codes, so that sign-in was cancelled")).toBeVisible();
  await page.goto("/admin/login/verify");
  await expect(page).toHaveURL(/\/admin\/login$/); // no challenge left
});

test("turning it off needs the password and a current code", async ({ page }) => {
  await password(page);
  await page.getByLabel("Code from your authenticator app").fill(await nextCode(page));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.goto("/admin/security");
  await page.getByLabel("Your password").fill("wrong-password-1");
  await page.getByLabel("Current code from the app").fill(code(-1));
  await page.getByRole("button", { name: "Turn off two-step sign-in" }).click();
  await expect(page.getByText("stays on")).toBeVisible();
  await signOut(page);
});

test("the owner can reset a locked-out colleague, who then signs in with a password again", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/users");
  const row = page.locator("tr", { hasText: USER.email });
  await expect(row).toContainText("On");
  await row.getByRole("button", { name: /Reset two-step sign-in/ }).click();
  await expect(page.getByText(/Two-step sign-in reset for/)).toBeVisible();
  await expect(page.locator("tr", { hasText: USER.email })).not.toContainText("Reset two-step");
  await signOut(page);

  await password(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
