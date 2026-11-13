import { describe, expect, it } from "vitest";
import { advanceConfigSchema, advanceFor, defaultAdvanceConfig, formatBps, type AdvanceConfig } from "@/lib/domain/advance";

const pct = (bps: number, extra: Partial<AdvanceConfig> = {}): AdvanceConfig => ({ ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps, ...extra });

describe("advanceFor", () => {
  it("is zero when the rule is off or missing", () => {
    expect(advanceFor(3000, null)).toEqual({ advance: 0, balance: 3000, bps: null });
    expect(advanceFor(3000, { ...pct(3333), enabled: false })).toEqual({ advance: 0, balance: 3000, bps: null });
  });

  it("one third of Rs. 3,000 is Rs. 1,000 and Rs. 2,000 on delivery (rounded up, not 999)", () => {
    expect(advanceFor(3000, pct(3333))).toEqual({ advance: 1000, balance: 2000, bps: 3333 });
  });

  it("half, and rounding up to the next rupee", () => {
    expect(advanceFor(3000, pct(5000))).toMatchObject({ advance: 1500, balance: 1500 });
    expect(advanceFor(999, pct(5000))).toMatchObject({ advance: 500, balance: 499 });
    expect(advanceFor(1, pct(3333))).toMatchObject({ advance: 1, balance: 0 });
  });

  it("advance + balance always equals the total", () => {
    for (const total of [1, 2, 3, 99, 100, 101, 1234, 2999, 3001, 54_321]) {
      for (const bps of [1, 100, 2500, 3333, 5000, 9999, 10_000]) {
        const q = advanceFor(total, pct(bps));
        expect(q.advance + q.balance).toBe(total);
        expect(q.advance).toBeGreaterThanOrEqual(0);
        expect(q.advance).toBeLessThanOrEqual(total);
      }
    }
  });

  it("a fixed advance never exceeds the order total", () => {
    const fixed: AdvanceConfig = { ...defaultAdvanceConfig(), enabled: true, mode: "fixed", fixed: 500 };
    expect(advanceFor(3000, fixed)).toEqual({ advance: 500, balance: 2500, bps: null });
    expect(advanceFor(300, fixed)).toEqual({ advance: 300, balance: 0, bps: null });
  });

  it("skips orders below the minimum order value", () => {
    const cfg = pct(5000, { minOrder: 2000 });
    expect(advanceFor(1999, cfg).advance).toBe(0);
    expect(advanceFor(2000, cfg).advance).toBe(1000);
  });

  it("rejects fractional or negative rupees", () => {
    expect(() => advanceFor(10.5, pct(5000))).toThrow();
    expect(() => advanceFor(-1, pct(5000))).toThrow();
  });
});

describe("advanceConfigSchema", () => {
  it("rejects percentages outside 0.01%..100%", () => {
    expect(advanceConfigSchema.safeParse({ ...pct(0) }).success).toBe(false);
    expect(advanceConfigSchema.safeParse({ ...pct(10_001) }).success).toBe(false);
    expect(advanceConfigSchema.safeParse(pct(10_000)).success).toBe(true);
  });
  it("formats basis points", () => {
    expect(formatBps(3333)).toBe("33.33%");
    expect(formatBps(5000)).toBe("50%");
    expect(formatBps(10_000)).toBe("100%");
  });
});
