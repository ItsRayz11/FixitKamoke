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
