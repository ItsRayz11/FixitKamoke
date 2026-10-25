import { expect, test, type Page } from "@playwright/test";
import { ensureOwnerLogin } from "./helpers";

/**
 * Cross-check for disconnected pieces: crawl every same-site link reachable from the storefront and the admin,
 * and fail on any broken page, server error, or browser console error. Runs last so data from other specs exists.
 */
test.setTimeout(600_000);

async function crawl(page: Page, start: string[], skip: RegExp, max = 140) {
  const seen = new Set<string>();
  const queue = [...start];
  const problems: string[] = [];
  await page.route("https://img.test/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") }));
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource.*(favicon|404)/.test(m.text())) consoleErrors.push(`${page.url()} :: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()} :: PAGE ERROR ${e.message.slice(0, 160)}`));

  while (queue.length && seen.size < max) {
    const path = queue.shift()!;
    if (seen.has(path) || skip.test(path)) continue;
    seen.add(path);
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    const status = res?.status() ?? 0;
    if (status >= 400) { problems.push(`${status} ${path}`); continue; }
    if (!new URL(page.url()).pathname.startsWith(new URL(path, "http://x").pathname.split("?")[0].slice(0, 4)) && /login/.test(page.url())) { problems.push(`redirected to login: ${path}`); continue; }
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
    for (const h of hrefs) {
      if (!h.startsWith("/") || h.startsWith("//")) continue;
      const clean = h.split("#")[0];
      if (clean && !seen.has(clean) && !queue.includes(clean)) queue.push(clean);
    }
  }
  return { seen, problems, consoleErrors };
}

test("every storefront link works and no page logs a console error", async ({ page, request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
  const { seen, problems, consoleErrors } = await crawl(page, ["/"], /^\/(admin|api|order\/|repairs\/status|unsubscribe|account\/reset)/);
  console.log(`storefront pages crawled: ${seen.size}`);
  expect(seen.size).toBeGreaterThan(25);
  expect(problems).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("every admin link works for the owner, with no errors", async ({ page }) => {
  await ensureOwnerLogin(page);
  const { seen, problems, consoleErrors } = await crawl(page, ["/admin"], /^\/(?!admin)|\/admin\/subscribers\/export|\/admin\/(logout)/);
  console.log(`admin pages crawled: ${seen.size}`);
  expect(seen.size).toBeGreaterThan(15);
  expect(problems).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
