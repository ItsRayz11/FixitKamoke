import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ensureOwnerLogin } from "./helpers";

const PAGES = [
  "/admin", "/admin/orders", "/admin/repairs", "/admin/messages", "/admin/customers", "/admin/products", "/admin/categories",
  "/admin/inventory", "/admin/coupons", "/admin/reviews", "/admin/shipping", "/admin/blog", "/admin/subscribers",
  "/admin/settings", "/admin/payments", "/admin/email", "/admin/users", "/admin/audit", "/admin/analytics", "/admin/preview",
  "/admin/products/new", "/admin/security",
];

const serious = (r: Awaited<ReturnType<AxeBuilder["analyze"]>>) =>
  r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} e.g. ${v.nodes[0]?.target.join(" ")}`);

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/dev/seed");
  await ensureOwnerLogin(page);
});

for (const width of [320, 360, 393, 414]) {
  test(`every admin page fits a ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Client-side fitting (phone preview zoom, table card labels) settles shortly after load, so poll rather than sample once.
      const overflow = () => page.evaluate(() => {
        const d = document.documentElement;
        const who = d.scrollWidth - d.clientWidth > 0 ? [...document.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > d.clientWidth + 0.5).slice(0, 4).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}@${Math.round(e.getBoundingClientRect().right)}`) : [];
        return { over: d.scrollWidth - d.clientWidth, who };
      });
      await expect.poll(async () => (await overflow()).over, { timeout: 8000 }).toBeLessThanOrEqual(0).catch(async (e) => { throw new Error(`${path} at ${width}px overflows by ${JSON.stringify(await overflow())}
${e}`); });
      const o = await page.evaluate(() => ({
        over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // A scroll wrapper that still scrolls sideways means a table did not collapse into cards.
        scrolling: [...document.querySelectorAll("main .overflow-x-auto")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => String(e.className).slice(0, 50)),
        wide: [...document.querySelectorAll("main *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 1 && !e.closest(".sr-only, table.rtable thead"); }).slice(0, 3).map((e) => e.tagName + "." + String(e.className).slice(0, 50)),
      }));
      expect(o.over, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      if (path !== "/admin/preview") {
        expect(o.scrolling, `${path} at ${width}px still scrolls sideways`).toEqual([]);
        expect(o.wide, `${path} at ${width}px has elements wider than the screen`).toEqual([]);
      }
    }
  });
}

test("phone navigation: quick tabs, menu drawer, active page", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 800 });
  await page.goto("/admin/orders");
  const tabs = page.getByRole("navigation", { name: "Admin quick tabs" });
  await expect(tabs).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Admin sidebar" })).toBeHidden();
  await expect(tabs.getByRole("link", { name: /Orders/ })).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "Open admin menu" }).click();
  const menu = page.getByRole("dialog");
  for (const g of ["Overview", "Sales", "Catalogue", "Content", "Settings"]) await expect(menu.getByText(g, { exact: true })).toBeVisible();
  await menu.getByRole("link", { name: "Inventory" }).click();
  await expect(page).toHaveURL(/\/admin\/inventory/);
  await expect(page.getByRole("dialog")).toHaveCount(0); // navigating closes the drawer

  await tabs.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("phone tables become labelled cards", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 800 });
  await page.goto("/admin/products");
  await page.waitForLoadState("networkidle");
  const cell = page.locator("main table.rtable tbody td[data-label]").first();
  await expect(cell).toBeVisible();
  await expect(page.locator("main table.rtable thead")).not.toBeInViewport(); // visually hidden, still in the DOM for screen readers
  expect(await cell.evaluate((e) => getComputedStyle(e).display)).toBe("flex");
});

test("desktop shows the sidebar, not the phone bars", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/admin/analytics");
  await expect(page.getByRole("complementary", { name: "Admin sidebar" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin quick tabs" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Funnel" })).toHaveAttribute("aria-current", "page");
  const table = page.locator("main table").first();
  expect(await table.evaluate((e) => getComputedStyle(e).display)).toBe("table"); // cards apply to phones only
});

for (const [name, w] of [["phone", 393], ["desktop", 1280]] as const) {
  test(`admin has no serious accessibility violations on ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    for (const path of ["/admin", "/admin/orders", "/admin/products", "/admin/products/new", "/admin/analytics"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(serious(r), `${path} on ${name}`).toEqual([]);
    }
  });
}

test("detail pages (order, repair, product edit, blog edit) fit a phone and stay accessible", async ({ page }) => {
  // Create a real order and repair through the public forms, so the detail pages have content.
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Mobile Admin Customer");
  await page.getByLabel("Mobile number").fill("0301 5551234");
  await page.getByLabel("City").fill("Kamoki");
  await page.getByLabel("Complete delivery address").fill("House 12, a long street name to wrap, Kamoki");
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);

  await page.goto("/repairs");
  await page.getByLabel("Phone brand").fill("Samsung");
  await page.getByLabel("Phone model").fill("Galaxy A54");
  await page.getByLabel("Describe the problem").fill("Screen cracked after a fall, touch still works but a line runs down the middle");
  await page.getByLabel("Your name").fill("Repair Customer");
  await page.getByLabel("Mobile number").fill("0300 1112223");
  await page.getByRole("button", { name: "Send repair request" }).click();
  await page.waitForURL(/\/repairs\/status\/RP-/);

  await ensureOwnerLogin(page);
  const detail: string[] = [];
  for (const list of ["/admin/orders", "/admin/repairs", "/admin/products", "/admin/blog"]) {
    await page.goto(list);
    const link = page.locator(`main a[href^="${list}/"]:not([href$="/new"])`).first();
    if (await link.count()) detail.push((await link.getAttribute("href"))!);
  }
  expect(detail.length, "found a detail page to open for orders, repairs, products").toBeGreaterThanOrEqual(3);

  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of detail) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${path} at ${width}px`, timeout: 8000 }).toBeLessThanOrEqual(0);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(serious(r), `${path} at ${width}px`).toEqual([]);
    }
  }
});
