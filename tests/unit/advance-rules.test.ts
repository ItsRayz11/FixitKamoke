import { describe, expect, it } from "vitest";
import { advanceFor, advanceForOrder, defaultAdvanceConfig, type AdvanceConfig, type AdvanceRule } from "@/lib/domain/advance";
import { isCustomerUpload, cleanCustomerUploads } from "@/lib/cloudinary";

const P1 = "11111111-1111-4111-8111-111111111111", P2 = "22222222-2222-4222-8222-222222222222", C1 = "33333333-3333-4333-8333-333333333333";
const rule = (r: Partial<AdvanceRule> & Pick<AdvanceRule, "kind" | "id" | "mode">): AdvanceRule => ({ label: "x", bps: 5000, fixed: 500, ...r });
const cfg = (rules: AdvanceRule[], extra: Partial<AdvanceConfig> = {}): AdvanceConfig => ({ ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333, rules, ...extra });
const line = (productId: string, categoryId: string | null, lineTotal: number, quantity = 1) => ({ productId, categoryId, lineTotal, quantity });

describe("advance exceptions by product and category", () => {
  it("with no exception touching the cart it is exactly the general rule", () => {
    const c = cfg([rule({ kind: "product", id: P2, mode: "none" })]);
    expect(advanceForOrder([line(P1, null, 3000)], 0, 0, 3000, c)).toEqual(advanceFor(3000, c));
  });

  it("a category can need a bigger advance than the general rule", () => {
    const c = cfg([rule({ kind: "category", id: C1, mode: "percent", bps: 5000 })]);
    expect(advanceForOrder([line(P1, C1, 10_000)], 0, 0, 10_000, c)).toMatchObject({ advance: 5000, balance: 5000, bps: null });
  });

  it("a product exception beats a category exception", () => {
    const c = cfg([rule({ kind: "category", id: C1, mode: "percent", bps: 5000 }), rule({ kind: "product", id: P1, mode: "none" })]);
    expect(advanceForOrder([line(P1, C1, 10_000)], 0, 0, 10_000, c).advance).toBe(0);
  });

  it("a mixed cart adds the parts: excepted item by its rule, the rest (and delivery) by the general rule", () => {
    const c = cfg([rule({ kind: "product", id: P1, mode: "percent", bps: 5000 })]);
    // P1: 50% of 4000 = 2000. General: one third of (1000 item + 200 delivery) = 400.
    expect(advanceForOrder([line(P1, null, 4000), line(P2, null, 1000)], 0, 200, 5200, c)).toMatchObject({ advance: 2400, balance: 2800 });
  });

  it("an item with no advance leaves only the rest to the general rule", () => {
    const c = cfg([rule({ kind: "product", id: P1, mode: "none" })]);
    expect(advanceForOrder([line(P1, null, 4000), line(P2, null, 3000)], 0, 0, 7000, c).advance).toBe(1000);
  });

  it("a fixed exception is per unit and never more than the item's share", () => {
    const c = cfg([rule({ kind: "product", id: P1, mode: "fixed", fixed: 300 })]);
    expect(advanceForOrder([line(P1, null, 2000, 2)], 0, 0, 2000, c).advance).toBe(600);
    expect(advanceForOrder([line(P1, null, 200, 2)], 0, 0, 200, c).advance).toBe(200);
  });

  it("a coupon is spread over the items by price, so the advance follows what is really paid", () => {
    const c = cfg([rule({ kind: "product", id: P1, mode: "percent", bps: 10_000 })]);
    // 1000 off 4000+1000: P1 gets 800 off -> full prepay of 3200; P2 gets 200 off -> general third of 800 = 267.
    expect(advanceForOrder([line(P1, null, 4000), line(P2, null, 1000)], 1000, 0, 4000, c)).toMatchObject({ advance: 3200 + 267, balance: 4000 - 3467 });
  });

  it("applies even when the general rule is off, and the minimum order still decides", () => {
    const c = cfg([rule({ kind: "category", id: C1, mode: "percent", bps: 5000 })], { enabled: false, minOrder: 5000 });
    expect(advanceForOrder([line(P1, C1, 10_000)], 0, 0, 10_000, c).advance).toBe(5000);
    expect(advanceForOrder([line(P1, C1, 4000)], 0, 0, 4000, c).advance).toBe(0);
    expect(advanceForOrder([line(P2, null, 10_000)], 0, 0, 10_000, c).advance).toBe(0);
  });

  it("is whole rupees, never negative, never above the total, and advance + balance is the total", () => {
    const c = cfg([rule({ kind: "category", id: C1, mode: "percent", bps: 10_000 }), rule({ kind: "product", id: P2, mode: "fixed", fixed: 999_999 })]);
    for (const [a, b, d, f] of [[1, 1, 0, 0], [999, 1001, 7, 150], [12_345, 6_789, 1_000, 0], [100, 100, 200, 50]]) {
      const lines = [line(P1, C1, a), line(P2, null, b)];
      const total = Math.max(0, a + b - d + f);
      const q = advanceForOrder(lines, Math.min(d, a + b), f, total, c);
      expect(Number.isInteger(q.advance)).toBe(true);
      expect(q.advance).toBeGreaterThanOrEqual(0);
      expect(q.advance).toBeLessThanOrEqual(total);
      expect(q.advance + q.balance).toBe(total);
    }
  });

  it("an old saved rule without exceptions still loads", async () => {
    const { advanceConfigSchema } = await import("@/lib/domain/advance");
    expect(advanceConfigSchema.parse({ enabled: true, mode: "percent", bps: 3333, fixed: 500, minOrder: 0 }).rules).toEqual([]);
  });
});

describe("customer upload links", () => {
  const ok = "https://res.cloudinary.com/demo-cloud/image/upload/v1699999999/fixit/receipts/abcd1234.jpg";
  it("accepts only pictures in the shop's own account and folder", () => {
    expect(isCustomerUpload(ok, "receipt", "demo-cloud")).toBe(true);
    expect(isCustomerUpload(ok.replace("fixit/receipts", "fixit/repairs"), "repair", "demo-cloud")).toBe(true);
    expect(isCustomerUpload(ok, "repair", "demo-cloud")).toBe(false); // wrong folder
    expect(isCustomerUpload(ok, "receipt", "other-cloud")).toBe(false); // someone else's account
    expect(isCustomerUpload(ok, "receipt", undefined)).toBe(false); // uploads not set up
    expect(isCustomerUpload("https://evil.example/fixit/receipts/abcd1234.jpg", "receipt", "demo-cloud")).toBe(false);
    expect(isCustomerUpload("javascript:alert(1)", "receipt", "demo-cloud")).toBe(false);
    expect(isCustomerUpload(ok + "?x=1", "receipt", "demo-cloud")).toBe(false);
    expect(isCustomerUpload(ok.replace(".jpg", ".svg"), "receipt", "demo-cloud")).toBe(false);
    expect(isCustomerUpload(ok.replace("fixit/receipts/", "fixit/receipts/../x/"), "receipt", "demo-cloud")).toBe(false);
    expect(isCustomerUpload(123, "receipt", "demo-cloud")).toBe(false);
  });
  it("keeps at most three distinct links and refuses the whole list if one is bad", () => {
    expect(cleanCustomerUploads([ok, ok], "receipt", "demo-cloud")).toEqual([ok]);
    expect(cleanCustomerUploads(undefined, "receipt", "demo-cloud")).toEqual([]);
    expect(() => cleanCustomerUploads([ok, "https://x.test/a.jpg"], "receipt", "demo-cloud")).toThrow();
    expect(() => cleanCustomerUploads([ok, ok, ok, ok], "receipt", "demo-cloud")).toThrow();
    expect(() => cleanCustomerUploads("nope", "receipt", "demo-cloud")).toThrow();
  });
});
