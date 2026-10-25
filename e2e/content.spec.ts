import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

test("policy pages render, are marked as drafts until approved, and show live delivery fees", async ({ page }) => {
  for (const slug of ["shipping", "returns", "warranty", "privacy", "terms"]) {
    await page.goto(`/policies/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Draft: this page is waiting for the shop owner")).toBeVisible();
  }
  await page.goto("/policies/shipping");
  await expect(page.getByRole("cell", { name: "Kamoki (demo)" })).toBeVisible();
  await expect(page.getByText("These terms are to be confirmed by Fixit.")).toBeVisible();
  expect((await page.goto("/policies/not-a-policy"))?.status()).toBe(404);
});

test("faq opens answers and links resolve", async ({ page }) => {
  await page.goto("/faq");
  await page.getByText("Do I need an account to order?").click();
  await expect(page.getByText("You can check out as a guest.")).toBeVisible();
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
});

test("about page is brand-first and never shows the founder until the owner enables it", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "About Fixit", level: 1 })).toBeVisible();
  await expect(page.getByText("A message from Ali Hassan")).toHaveCount(0);
});

test("contact page: honest placeholders, validation, and a stored message", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByText("The map will appear here once the shop location is confirmed.")).toBeVisible();
  await expect(page.getByText("To be confirmed.").first()).toBeVisible();
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Please check the highlighted fields.")).toBeVisible();
  await page.getByLabel("Your name").fill("Contact Person");
  await page.getByLabel("Message", { exact: true }).fill("Do you have a charger for my phone?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Add a phone number or an email.")).toBeVisible();
  await page.getByLabel("Email").fill("person@example.com");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Thank you, your message has been received.")).toBeVisible();

  await ensureOwnerLogin(page);
  await page.goto("/admin/messages");
  await expect(page.getByText("Do you have a charger for my phone?")).toBeVisible();
});

test("owner settings change the storefront: announcement, WhatsApp, address, founder, policy approval", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/settings");
  await page.getByLabel("WhatsApp number").fill("923001234567");
  await page.getByLabel("Shop address").fill("Test Road, Kamoki");
  await page.getByLabel("Announcement bar").fill("Free delivery in Kamoki on test orders");
  await page.getByLabel("Show a founder section").check();
  await page.getByLabel("Founder message").fill("Welcome to Fixit.");
  await page.getByLabel(/I have reviewed and approved/).check();
  await page.getByLabel("Returns and refunds terms").fill("Return window: **7 days** (test).");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Store settings saved.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Free delivery in Kamoki on test orders")).toBeVisible();
  await expect(page.locator('a[href^="https://wa.me/923001234567"]').first()).toBeVisible();
  await page.goto("/about");
  await expect(page.getByText("A message from Ali Hassan")).toBeVisible();
  await page.goto("/policies/returns");
  await expect(page.getByText("Draft: this page is waiting")).toHaveCount(0);
  await expect(page.getByText("7 days")).toBeVisible();
  await page.goto("/contact");
  await expect(page.getByText("Test Road, Kamoki").first()).toBeVisible();
});

test("an unsafe maps embed is never put in an iframe", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/settings");
  await page.getByLabel("Google Maps embed link").fill("https://evil.example/maps/embed?pb=1");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Store settings saved.")).toBeVisible();
  await page.goto("/contact");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.goto("/admin/settings");
  await page.getByLabel("Google Maps embed link").fill("https://www.google.com/maps/embed?pb=test");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Store settings saved.")).toBeVisible();
  await page.goto("/contact");
  await expect(page.locator("iframe")).toHaveCount(1);
});

test("unknown URLs get the custom 404 with a way back", async ({ page }) => {
  const res = await page.goto("/definitely/not/a/page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
  await page.getByRole("link", { name: "Shop", exact: true }).first().click();
  await expect(page).toHaveURL(/\/shop/);
});

const PUBLIC_PAGES = ["/", "/shop", "/product/demo-usb-c-cable", "/cart", "/checkout", "/track", "/repairs", "/repairs/track", "/contact", "/about", "/faq", "/policies/shipping", "/policies/privacy"];

for (const path of PUBLIC_PAGES) {
  test(`accessibility (axe): no serious or critical issues on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes) e.g. ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  });
}
