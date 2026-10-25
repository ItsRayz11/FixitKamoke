import { test, expect, type Page } from "@playwright/test";

/**
 * Lab measurement of the PRODUCTION build under throttled conditions: slow 4G network + 4x slower CPU (roughly a budget Android phone).
 * These are lab numbers on the developer's machine, not real-user data. Re-run on the live site with Lighthouse / PageSpeed.
 * Runs after production.spec.ts (alphabetical), so the shop has a product to show.
 */
const PAGES = ["/", "/shop", "/product/prod-test-charger", "/repairs", "/contact", "/cart"];

async function measure(page: Page, path: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    const w = window as unknown as { __m: { lcp: number; cls: number; longMs: number } };
    w.__m = { lcp: 0, cls: 0, longMs: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 50) w.__m.longMs += e.duration - 50; }).observe({ type: "longtask", buffered: true });
  });
  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const w = window as unknown as { __m: { lcp: number; cls: number; longMs: number } };
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const js = res.filter((x) => x.initiatorType === "script" || x.name.endsWith(".js")).reduce((s, x) => s + (x.encodedBodySize || 0), 0);
    return { ttfb: nav.responseStart, lcp: w.__m.lcp, cls: w.__m.cls, tbt: w.__m.longMs, jsKB: Math.round(js / 1024), requests: res.length };
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return r;
}

test("performance budget on a throttled phone-like profile", async ({ browser }) => {
  const rows: string[] = [];
  const worst = { lcp: 0, cls: 0 };
  for (const p of PAGES) {
    const ctx = await browser.newContext({ baseURL: "http://localhost:3200", viewport: { width: 412, height: 915 }, userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const m = await measure(page, p);
    rows.push(`${p.padEnd(30)} TTFB ${String(Math.round(m.ttfb)).padStart(5)} ms | LCP ${String(Math.round(m.lcp)).padStart(5)} ms | CLS ${m.cls.toFixed(3)} | TBT~ ${String(Math.round(m.tbt)).padStart(4)} ms | JS ${m.jsKB} KB | ${m.requests} requests`);
    worst.lcp = Math.max(worst.lcp, m.lcp);
    worst.cls = Math.max(worst.cls, m.cls);
    await ctx.close();
  }
  console.log("\nPERF (slow 4G, 4x CPU, mobile viewport, production build)\n" + rows.join("\n"));
  expect(worst.cls, "CLS target is 0.1").toBeLessThanOrEqual(0.1);
  expect(worst.lcp, "LCP target is 2500 ms").toBeLessThanOrEqual(2500);
});
