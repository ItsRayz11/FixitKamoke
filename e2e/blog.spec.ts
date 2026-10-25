import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

const SLUG = "how-to-choose-the-right-phone-charger";

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

test("no guides are public until someone publishes one; drafts are not reachable", async ({ page }) => {
  await page.goto("/blog");
  await expect(page.getByText("Guides are coming soon.")).toBeVisible();
  expect((await page.goto(`/blog/${SLUG}`))?.status()).toBe(404);
});

test("owner imports starter guides as drafts and cannot publish one without confirming the review", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/blog");
  await page.getByRole("button", { name: "Add starter guides" }).click();
  await expect(page.getByText(/Added 4 starter guides as drafts/)).toBeVisible();
  await expect(page.getByText("needs review").first()).toBeVisible();

  await page.getByRole("link", { name: "How to choose the right charger for your phone" }).click();
  await page.waitForURL(/\/admin\/blog\/[0-9a-f-]{36}/);
  await expect(page.getByText("This starter article has not been reviewed.")).toBeVisible();
  await page.getByLabel(/Published \(visible/).check();
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(page.getByText("has not been reviewed yet")).toBeVisible();
  expect((await page.goto(`/blog/${SLUG}`))?.status()).toBe(404);
});

test("after the reviewer confirms, the article is public with structured data, links and sharing", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/blog");
  await page.getByRole("link", { name: "How to choose the right charger for your phone" }).click();
  await page.waitForURL(/\/admin\/blog\/[0-9a-f-]{36}/);
  await page.getByLabel("Related products").fill("demo-usb-c-cable");
  await page.getByLabel(/Published \(visible/).check();
  await page.getByLabel(/I have read this article/).check();
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(page.getByText("Saved and published.")).toBeVisible();

  await page.goto("/blog");
  await expect(page.getByRole("link", { name: "How to choose the right charger for your phone" })).toBeVisible();
  await page.goto(`/blog/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How to choose the right charger for your phone");
  await expect(page.getByRole("link", { name: "Facebook" })).toHaveAttribute("href", /facebook\.com\/sharer/);
  await expect(page.getByRole("heading", { name: "Related products" })).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const parsed = ld.map((t) => JSON.parse(t)).flat();
  expect(parsed.some((j) => j["@type"] === "Article" && j.headline.includes("charger"))).toBe(true);
  expect(parsed.some((j) => j["@type"] === "BreadcrumbList")).toBe(true);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/blog\/how-to-choose/);
});

test("raw HTML in an article is shown as text, never executed", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/blog/new");
  await page.getByLabel("Title").fill("Safety test article");
  await page.getByLabel("Excerpt").fill("Testing that markup is escaped.");
  await page.getByLabel("Article text").fill("<script>window.__pwned = 1</script>\n\n[bad link](javascript:window.__pwned=1)\n\n" + "More safe text here. ".repeat(20));
  await page.getByLabel(/Published \(visible/).check();
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(page.getByText("Saved and published.")).toBeVisible();
  await page.goto("/blog/safety-test-article");
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await expect(page.getByText("<script>window.__pwned = 1</script>")).toBeVisible();
  expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
});

for (const path of ["/blog", `/blog/${SLUG}`]) {
  test(`accessibility (axe): no serious or critical issues on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.help} e.g. ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  });
}
