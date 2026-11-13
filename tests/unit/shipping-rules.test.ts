import { describe, expect, it } from "vitest";
import { quoteShipping, zoneProblems, type ShippingConfig, type ShippingZone } from "@/lib/domain/shipping";

const zone = (over: Partial<ShippingZone> = {}): ShippingZone => ({ id: "a", label: "Local", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 2], ...over });
const cfg = (zones: ShippingZone[], unlistedCity: ShippingConfig["unlistedCity"] = "manual_confirmation"): ShippingConfig => ({ version: "t", zones, unlistedCity });

describe("zoneProblems", () => {
  it("accepts a consistent set of zones", () => {
    expect(zoneProblems([zone(), zone({ id: "b", label: "Punjab", cities: ["Lahore", "Gujranwala"], fee: 300 })])).toBeNull();
  });
  it("refuses the same city in two active zones, ignoring case and spacing", () => {
    expect(zoneProblems([zone(), zone({ id: "b", label: "Punjab", cities: ["  kamoki "] })])).toMatch(/Kamoki|kamoki/);
  });
  it("allows the same city in an inactive zone, because it is ignored", () => {
    expect(zoneProblems([zone(), zone({ id: "b", label: "Old", cities: ["Kamoki"], active: false })])).toBeNull();
  });
  it("refuses duplicate zone names, backwards delivery times and a free-delivery threshold of zero", () => {
    expect(zoneProblems([zone(), zone({ id: "b", cities: ["Lahore"] })])).toMatch(/both called/);
    expect(zoneProblems([zone({ etaDays: [5, 2] })])).toMatch(/must not be larger/);
    expect(zoneProblems([zone({ freeThreshold: 0 })])).toMatch(/above Rs\. 0/);
  });
});

describe("quoteShipping with zone switches", () => {
  it("a switched-off zone behaves like an unlisted city", () => {
    expect(quoteShipping(cfg([zone({ active: false })]), "Kamoki", 1000).status).toBe("needs_confirmation");
    expect(quoteShipping(cfg([zone({ active: false })], "not_serviceable"), "Kamoki", 1000).status).toBe("not_serviceable");
  });
  it("reports whether the COD advance applies in the zone", () => {
    const on = quoteShipping(cfg([zone()]), "Kamoki", 1000);
    const off = quoteShipping(cfg([zone({ advance: false })]), "Kamoki", 1000);
    expect(on.status === "quoted" && on.advanceApplies).toBe(true);
    expect(off.status === "quoted" && off.advanceApplies).toBe(false);
  });
});
