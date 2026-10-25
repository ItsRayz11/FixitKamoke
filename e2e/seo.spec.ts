import { expect, test } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

test("sitemap lists real public pages and never private ones", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("/product/demo-usb-c-cable");
  expect(xml).toContain("/category/chargers-cables");
  expect(xml).toContain("/policies/shipping");
  for (const priv of ["/admin", "/cart", "/checkout", "/order/", "/track", "/account", "/repairs/status"]) expect(xml).not.toContain(priv);
});

test("sitemap excludes unpublished products", async ({ page, request }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill("Unpublished Secret Item");
  await page.getByLabel("Price (Rs.)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).not.toContain("unpublished-secret-item");
  expect((await request.get("/product/unpublished-secret-item")).status()).toBe(404);
});

test("demo mode blocks all crawling in robots.txt", async ({ request }) => {
  const txt = await (await request.get("/robots.txt")).text();
  expect(txt).toMatch(/Disallow: \//);
});

test("private pages are marked noindex", async ({ page }) => {
  for (const path of ["/cart", "/checkout", "/track", "/repairs/track", "/order/FX-NONE?t=x", "/repairs/status/RP-NONE?t=x", "/admin/login"]) {
    await page.goto(path);
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots, path).toContain("noindex");
  }
});

test("filtered shop pages are noindex with a canonical to /shop; the plain shop is indexable", async ({ page }) => {
  await page.goto("/shop?q=cable");
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/shop$/);
  await page.goto("/shop");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("product pages carry product + breadcrumb structured data with real price and stock, and no ratings", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable");
  const blocks = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t)).flat();
  const product = blocks.find((b) => b["@type"] === "Product");
  expect(product.offers).toMatchObject({ priceCurrency: "PKR", availability: "https://schema.org/InStock" });
  expect(Number(product.offers.price)).toBeGreaterThan(0);
  expect(JSON.stringify(blocks)).not.toMatch(/aggregateRating|reviewCount|ratingValue/);
  expect(blocks.find((b) => b["@type"] === "BreadcrumbList").itemListElement.length).toBeGreaterThanOrEqual(3);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/product\/demo-usb-c-cable$/);
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
});

test("category pages have their own URL, heading and canonical", async ({ page }) => {
  await page.goto("/category/chargers-cables");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chargers & Cables");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/category\/chargers-cables$/);
  expect((await page.goto("/category/nope"))?.status()).toBe(404);
});

test("every public page has one h1, a title and a description", async ({ page }) => {
  for (const path of ["/", "/shop", "/repairs", "/contact", "/about", "/faq", "/blog", "/policies/privacy", "/product/demo-usb-c-cable", "/category/chargers-cables"]) {
    await page.goto(path);
    await expect(page.locator("h1"), path).toHaveCount(1);
    expect((await page.title()).length, path).toBeGreaterThan(5);
    expect(await page.locator('meta[name="description"]').getAttribute("content"), path).toBeTruthy();
  }
});
