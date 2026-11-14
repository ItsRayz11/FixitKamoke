import { describe, expect, it } from "vitest";
import { normalizePkMobile } from "@/lib/domain/phone";
import { quoteShipping, type ShippingConfig } from "@/lib/domain/shipping";
import { couponDiscount, orderTotals } from "@/lib/domain/pricing";
import { canTransition, nextStatuses } from "@/lib/domain/order-state";
import { assertRupees, formatPKR } from "@/lib/domain/money";

describe("phone", () => {
  it.each(["0300 1234567", "+92 300 1234567", "923001234567", "0092-300-1234567", "3001234567"])(
    "accepts %s", (n) => expect(normalizePkMobile(n)).toBe("+923001234567"));
  it.each(["", "12345", "0200 1234567", "+1 415 555 0100", "abc", "030012345"])(
    "rejects %s", (n) => expect(normalizePkMobile(n)).toBeNull());
});

const cfg: ShippingConfig = {
  version: "test-v1",
  unlistedCity: "manual_confirmation",
  zones: [
    { id: "local", label: "Local", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 1] },
    { id: "pk", label: "Pakistan", cities: ["Lahore", "Karachi"], fee: 300, freeThreshold: 5000, codAvailable: true, etaDays: [3, 5] },
  ],
};

describe("shipping", () => {
  it("quotes local zone, ignoring case and spacing", () => {
    expect(quoteShipping(cfg, "  KAMOKI ", 100)).toMatchObject({ status: "quoted", fee: 0, zoneId: "local" });
  });
  it("charges fee below threshold and waives at threshold", () => {
    expect(quoteShipping(cfg, "Lahore", 4999)).toMatchObject({ fee: 300 });
    expect(quoteShipping(cfg, "Lahore", 5000)).toMatchObject({ fee: 0 });
  });
  it("requires confirmation for unlisted cities", () => {
    expect(quoteShipping(cfg, "Gwadar", 100).status).toBe("needs_confirmation");
    expect(quoteShipping({ ...cfg, unlistedCity: "not_serviceable" }, "Gwadar", 100).status).toBe("not_serviceable");
  });
});

describe("pricing", () => {
  it("computes integer totals", () => {
    expect(orderTotals([{ unitPrice: 499, quantity: 3 }], null, 200)).toEqual({ subtotal: 1497, discount: 0, shippingFee: 200, total: 1697 });
  });
  it("percent discount floors, respects min and cap", () => {
    const c = { type: "percent" as const, value: 10, minSubtotal: 1000, maxDiscount: 150 };
    expect(couponDiscount(999, c)).toBe(0);
    expect(couponDiscount(1005, c)).toBe(100);
    expect(couponDiscount(5000, c)).toBe(150);
  });
  it("fixed discount never exceeds subtotal", () => {
    expect(couponDiscount(300, { type: "fixed", value: 500, minSubtotal: 0, maxDiscount: null })).toBe(300);
  });
  it("rejects bad quantities and non-integers", () => {
    expect(() => orderTotals([{ unitPrice: 10, quantity: 0 }], null, 0)).toThrow();
    expect(() => orderTotals([{ unitPrice: 10.5, quantity: 1 }], null, 0)).toThrow();
    expect(() => assertRupees(-1)).toThrow();
    expect(formatPKR(1500)).toMatch(/^Rs\. 1,500$/);
  });
});

describe("order state machine", () => {
  it("allows the happy path", () => {
    const path = ["pending_confirmation", "confirmed", "processing", "shipped", "delivered"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it("rejects skips and exits from terminal states", () => {
    expect(canTransition("pending_confirmation", "shipped")).toBe(false);
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(nextStatuses("cancelled")).toEqual([]);
  });
});

import { rateLimit } from "@/lib/rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit inside a window, then blocks, and keys are independent", () => {
    const k = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(k, 3, 60_000)).toBe(true);
    expect(rateLimit(k, 3, 60_000)).toBe(false);
    expect(rateLimit(`${k}-other`, 3, 60_000)).toBe(true);
  });
  it("starts a fresh window after it expires", async () => {
    const k = `t-${Math.random()}`;
    expect(rateLimit(k, 1, 20)).toBe(true);
    expect(rateLimit(k, 1, 20)).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(rateLimit(k, 1, 20)).toBe(true);
  });
});

describe("promotions (phase 5)", () => {
  it("free-delivery coupons take off only the delivery fee and respect the minimum", async () => {
    const { couponDiscount, orderTotals } = await import("@/lib/domain/pricing");
    const c = { type: "freeship" as const, value: 1, minSubtotal: 1000, maxDiscount: null };
    expect(couponDiscount(999, c, 300)).toBe(0);
    expect(couponDiscount(1000, c, 300)).toBe(300);
    expect(orderTotals([{ unitPrice: 1000, quantity: 1 }], c, 300)).toEqual({ subtotal: 1000, discount: 300, shippingFee: 300, total: 1000 });
  });
  it("a coupon limited to a category discounts only the eligible subtotal", async () => {
    const { couponDiscount } = await import("@/lib/domain/pricing");
    expect(couponDiscount(1500, { type: "percent", value: 10, minSubtotal: 0, maxDiscount: null }, 0, 1000)).toBe(100);
    expect(couponDiscount(1500, { type: "fixed", value: 900, minSubtotal: 0, maxDiscount: null }, 0, 400)).toBe(400);
  });
  it("percentOff only reports genuine discounts", async () => {
    const { percentOff } = await import("@/lib/domain/sale");
    expect(percentOff(3000, 2700)).toBe(10);
    expect(percentOff(3000, null)).toBeNull();
    expect(percentOff(3000, 3000)).toBeNull();
    expect(percentOff(3000, 3500)).toBeNull();
    expect(percentOff(10000, 9999)).toBeNull(); // rounds to 0%: not advertised
  });
});

describe("resolveSaleWindow and the countdown", () => {
  const now = new Date("2026-11-14T10:00:00Z");
  const none = { starts: null, ends: null };
  it("a length starts now and ends exactly that many days later", async () => {
    const { resolveSaleWindow } = await import("@/lib/domain/sale");
    for (const d of [1, 2, 7]) {
      const w = resolveSaleWindow({ length: String(d), startsDate: "", endsDate: "", prev: none, now }) as { starts: Date; ends: Date };
      expect(w.starts).toEqual(now);
      expect(w.ends.getTime() - now.getTime()).toBe(d * 86_400_000);
    }
  });
  it("refuses a length that is not on the list", async () => {
    const { resolveSaleWindow } = await import("@/lib/domain/sale");
    for (const bad of ["0", "5", "-1", "abc", "9999"]) expect(resolveSaleWindow({ length: bad, startsDate: "", endsDate: "", prev: none, now })).toHaveProperty("error");
  });
  it("typed dates are end-of-day Pakistan time, but an unchanged date keeps its exact stored time", async () => {
    const { resolveSaleWindow } = await import("@/lib/domain/sale");
    const typed = resolveSaleWindow({ length: "", startsDate: "", endsDate: "2026-11-20", prev: none, now }) as { ends: Date };
    expect(typed.ends.toISOString()).toBe("2026-11-20T18:59:59.000Z");
    const exact = new Date("2026-11-20T04:30:12Z"); // set earlier by a "2 days" length; same PKT day as the date shown in the form
    const kept = resolveSaleWindow({ length: "", startsDate: "", endsDate: "2026-11-20", prev: { starts: null, ends: exact }, now }) as { ends: Date };
    expect(kept.ends).toEqual(exact);
  });
  it("rejects impossible or backwards dates", async () => {
    const { resolveSaleWindow } = await import("@/lib/domain/sale");
    expect(resolveSaleWindow({ length: "", startsDate: "2026-13-45", endsDate: "", prev: none, now })).toHaveProperty("error");
    expect(resolveSaleWindow({ length: "", startsDate: "2026-11-20", endsDate: "2026-11-19", prev: none, now })).toHaveProperty("error");
  });
  it("reports where a sale stands", async () => {
    const { saleStatus, longDuration } = await import("@/lib/domain/sale");
    const h = (n: number) => new Date(now.getTime() + n * 3_600_000);
    expect(saleStatus({ salePrice: null, starts: null, ends: null, now }).kind).toBe("none");
    expect(saleStatus({ salePrice: 100, starts: h(1), ends: h(48), now }).kind).toBe("scheduled");
    expect(saleStatus({ salePrice: 100, starts: h(-1), ends: h(48), now })).toMatchObject({ kind: "running", msLeft: 48 * 3_600_000 });
    expect(saleStatus({ salePrice: 100, starts: null, ends: null, now })).toMatchObject({ kind: "running", msLeft: null });
    expect(saleStatus({ salePrice: 100, starts: h(-50), ends: h(-1), now }).kind).toBe("ended");
    expect(longDuration(53 * 3_600_000 + 10 * 60_000)).toBe("2 days 5 hours");
    expect(longDuration(61 * 60_000)).toBe("1 hour 1 minute");
  });
  it("formats the countdown", async () => {
    const { formatCountdown } = await import("@/components/ui/sale-timer");
    expect(formatCountdown(2 * 86_400_000 + 5 * 3_600_000 + 13 * 60_000 + 9_000)).toBe("2d 05h 13m");
    expect(formatCountdown(5 * 3_600_000 + 13 * 60_000 + 22_000)).toBe("05:13:22");
    expect(formatCountdown(-50)).toBe("00:00:00");
  });
});
