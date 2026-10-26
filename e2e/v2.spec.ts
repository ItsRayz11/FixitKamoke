import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ensureOwnerLogin } from "./helpers";

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

const serious = (r: Awaited<ReturnType<AxeBuilder["analyze"]>>) =>
  r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} e.g. ${v.nodes[0]?.target.join(" ")}`);

test("finishes: choosing one swaps the real photo, price, stock and address together, and adds that finish to the cart", async ({ page }) => {
  await page.goto("/product/demo-stand-titanium");
  const photo = page.locator("main img").first();
  await expect(photo).toHaveAttribute("src", /stand-titanium\.svg/);
  await expect(page.getByTestId("finish-name")).toHaveText("Titanium Grey");

  await page.getByRole("radio", { name: /Silver/ }).click();
  await expect(photo).toHaveAttribute("src", /stand-silver\.svg/);
  await expect(page.getByTestId("finish-name")).toHaveText("Silver");
  await expect(page.getByText("Rs. 1,200").first()).toBeVisible();
  await expect(page).toHaveURL(/\/product\/demo-stand-silver$/);

  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toContainText("DEMO Aluminium Phone Stand — Silver");

  // A refresh or shared link lands on the same finish.
  await page.goto("/product/demo-stand-silver");
  await expect(page.getByTestId("finish-name")).toHaveText("Silver");
});

test("a sold-out finish is labelled and cannot be bought", async ({ page }) => {
  await page.goto("/product/demo-stand-titanium");
  await expect(page.getByRole("radio", { name: /Midnight Blue.*sold out/ })).toBeVisible();
  await page.getByRole("radio", { name: /Midnight Blue/ }).click();
  await expect(page.getByRole("button", { name: "Out of stock" }).first()).toBeDisabled();
});

test("a required finish must be chosen first, and the order records which finish was bought", async ({ page }) => {
  await page.goto("/product/demo-braided-cable-black");
  await expect(page.getByText("From Rs. 900")).toBeVisible();
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Choose a finish" }).first().click();
  await expect(page.getByRole("alert").filter({ hasText: "choose a finish" })).toBeVisible();
  await expect(page.getByTestId("cart-count")).toHaveText("0");
  await expect(page.getByRole("radio").first()).toBeFocused();

  await page.getByRole("radio", { name: /Blue/ }).click();
  await expect(page.getByText("Rs. 950").first()).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");

  await page.goto("/checkout");
  await expect(page.getByText("DEMO Braided Cable 2m — Blue")).toBeVisible();
  await page.getByLabel("Full name").fill("Finish Buyer");
  await page.getByLabel("Mobile number").fill("0300 7654321");
  await page.getByLabel("City").fill("Kamoki");
  await page.getByLabel("Complete delivery address").fill("House 9, Finish Street, Kamoki");
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/FX-/);
  await expect(page.getByText("DEMO Braided Cable 2m — Blue")).toBeVisible();
});

test("finish choice is keyboard operable (arrow keys move the choice)", async ({ page }) => {
  await page.goto("/product/demo-stand-titanium");
  await page.getByRole("radio", { name: /Titanium Grey/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /Midnight Blue/ })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /Silver/ })).toBeChecked();
});

test("cart confirmation offers both next steps: continue shopping or open the cart", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  const toast = page.getByText("Added “DEMO USB-C Cable 1m” to cart");
  await expect(toast).toBeVisible();
  await page.getByRole("button", { name: "Continue shopping" }).click();
  await expect(toast).toBeHidden();
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.getByRole("link", { name: "Open cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);
});

test("phone: the purchase bar appears while the main button is off screen and never on desktop", async ({ page, isMobile }) => {
  await page.goto("/product/demo-usb-c-cable");
  await page.waitForLoadState("networkidle");
  const bar = page.getByTestId("purchase-bar");
  if (isMobile) {
    await expect(bar).toBeVisible();
    await bar.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    // Never sits on top of a focused form field: it steps aside while a field is in use.
    await page.evaluate(() => { const i = document.createElement("input"); i.id = "probe"; document.body.append(i); i.focus(); });
    await expect(bar).toBeHidden();
  } else {
    await expect(bar).toBeHidden();
  }
});

test("mobile menu drawer opens, shows the links, and closes with Escape", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByRole("link", { name: /Repairs/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  await page.getByRole("button", { name: "Search products" }).click();
  await page.getByRole("searchbox").last().fill("usb");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/shop\?q=usb/);
});

for (const width of [320, 360, 393, 414]) {
  test(`no horizontal overflow or clipped content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/product/demo-usb-c-cable");
    await page.getByRole("button", { name: "Add to cart" }).first().click();
    for (const path of ["/", "/shop", "/category/chargers-cables", "/product/demo-braided-cable-black", "/product/demo-stand-titanium", "/cart", "/checkout", "/compare", "/repairs", "/track"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const o = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 1 && !e.closest("[class*=overflow-x-auto],[class*=overflow-hidden],table,.sr-only"); }).slice(0, 3).map((e) => e.tagName + "." + String(e.className).slice(0, 60)) }));
      expect(o.over, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      expect(o.wide, `${path} at ${width}px has elements wider than the screen`).toEqual([]);
    }
  });
}

test("touch targets: primary controls are at least 44px tall on the product page", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/product/demo-stand-titanium");
  for (const loc of [page.getByRole("button", { name: "Add to cart" }).first(), page.getByRole("radio").first(), page.getByRole("button", { name: "Increase quantity" })]) {
    const box = await loc.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(43.5);
  }
});

test("reduced motion: the product stage stays static and everything remains usable", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", baseURL: "http://localhost:3100" });
  const page = await ctx.newPage();
  await page.goto("/product/demo-stand-titanium");
  const t = await page.locator(".spotlight-inner").first().evaluate((el) => getComputedStyle(el).transform);
  expect(t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)").toBeTruthy();
  await page.getByRole("radio", { name: /Silver/ }).click();
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await ctx.close();
});

test("homepage follows the mobile order and shows only real data", async ({ page }) => {
  await page.goto("/");
  const headings = await page.getByRole("heading").allTextContents();
  const idx = (t: string) => headings.findIndex((h) => h.includes(t));
  expect(idx("Phone repairs")).toBe(0);
  expect(idx("Shop by category")).toBeGreaterThan(idx("Phone repairs"));
  expect(idx("Available now")).toBeGreaterThan(idx("Shop by category"));
  expect(idx("Repairs, confirmed")).toBeGreaterThan(idx("Available now"));
  expect(idx("Delivery")).toBeGreaterThan(idx("Repairs, confirmed"));
  // The hero text is white, so its panel must really be dark (guards against a style-layer regression making it invisible).
  const heroBg = await page.getByRole("heading", { level: 1 }).evaluate((h) => getComputedStyle(h.closest("section")!).backgroundColor);
  const [r, g, b] = heroBg.match(/\d+/g)!.map(Number);
  expect((r + g + b) / 3).toBeLessThan(60);
  await expect(page.getByRole("link", { name: "Shop accessories" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book a repair" }).first()).toBeVisible();
  // Finish families appear once, with real finish dots, not once per colour.
  await expect(page.getByRole("heading", { name: "DEMO Aluminium Phone Stand" })).toHaveCount(1);
  await expect(page.getByText(/\d+ in stock/).first()).toBeVisible();
});

test("compare: add two products and see only real listed details", async ({ page }) => {
  await page.goto("/product/demo-usb-c-cable");
  await page.getByRole("button", { name: "Compare with other products" }).click();
  await page.goto("/product/demo-earphones");
  await page.getByRole("button", { name: "Compare with other products" }).click();
  await page.getByRole("link", { name: /View comparison \(2\)/ }).click();
  await expect(page.getByRole("table")).toContainText("DEMO USB-C Cable 1m");
  await expect(page.getByRole("table")).toContainText("DEMO Wired Earphones");
  await expect(page.getByRole("table")).toContainText("—");
});

test("funnel events are counted without personal data and read in the admin report", async ({ page }) => {
  await page.goto("/shop");
  await page.getByRole("link", { name: "DEMO Wired Earphones" }).first().click();
  await page.waitForURL(/\/product\/demo-earphones/);
  await ensureOwnerLogin(page);
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Funnel and retention" })).toBeVisible();
  await expect(page.getByText("Not enough data").first()).toBeVisible(); // tiny sample is not dressed up as a rate
  await expect(page.getByText("No A/B test is running")).toBeVisible();
});

test("admin phone preview frames the storefront and switches widths", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/preview");
  await expect(page.getByRole("heading", { name: "Phone preview" })).toBeVisible();
  const frame = page.locator("iframe");
  await expect(frame).toHaveAttribute("title", /390px/);
  await page.getByRole("button", { name: "320", exact: true }).click();
  await expect(frame).toHaveAttribute("title", /320px/);
  expect(await frame.evaluate((f) => f.getBoundingClientRect().width)).toBe(320);
  await expect(page.frameLocator("iframe").getByRole("heading", { level: 1 })).toContainText("Phone repairs");
  await page.getByLabel(/Compare 320/).check();
  await expect(page.locator("iframe")).toHaveCount(2);
});

test("admin can define finishes, and an incomplete finish is rejected with the form kept", async ({ page }) => {
  await ensureOwnerLogin(page);
  await page.goto("/admin/products/new");
  const name = `Finish Form Item ${Date.now()}`;
  await page.getByLabel("Product name").fill(name);
  await page.getByLabel("Price (Rs.)", { exact: true }).fill("500");
  await page.getByLabel("Finish group").fill("finish-form-item");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Give this finish a name")).toBeVisible();
  await expect(page.getByLabel("Product name")).toHaveValue(name);
  await page.getByLabel("Finish name").fill("Graphite");
  await page.getByLabel("Swatch colour").fill("not-a-colour");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Finish colour must look like")).toBeVisible();
  await page.getByLabel("Swatch colour").fill("#33384A");
  await page.getByLabel("Stock quantity").fill("3");
  await page.getByLabel(/Published/).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
});

test("accessibility: product page with finishes, homepage and compare have no serious violations", async ({ page }) => {
  for (const path of ["/", "/product/demo-braided-cable-black", "/product/demo-stand-titanium", "/shop", "/compare"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(serious(r), path).toEqual([]);
  }
});
