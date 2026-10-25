import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

describe("robots.txt (non-demo, i.e. production rules)", () => {
  const r = robots();
  const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  const disallow = ([] as string[]).concat(rule.disallow ?? []);

  it("lets crawlers in but keeps private and transactional areas out", () => {
    expect(rule.allow).toBe("/");
    for (const p of ["/admin", "/api/", "/cart", "/checkout", "/order/", "/track", "/account", "/repairs/status/"]) expect(disallow).toContain(p);
  });

  it("advertises the sitemap", () => {
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
