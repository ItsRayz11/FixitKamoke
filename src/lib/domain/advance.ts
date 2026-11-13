import { z } from "zod";
import { assertRupees } from "./money";

/**
 * Cash-on-delivery advance. The owner chooses how much a customer must pay up front (by bank transfer or a wallet,
 * checked by staff) before a COD order can be confirmed. The rest is collected on delivery.
 *
 * Money rules (documented policy):
 *  - Everything is whole rupees.
 *  - A percentage is stored in basis points (1% = 100) so "one third" can be 33.33% (3333) exactly as written down.
 *  - The advance is calculated on the FINAL order total (after discount, including delivery), and ROUNDED UP to the next rupee,
 *    so one third of Rs. 3,000 is Rs. 1,000 (not 999).
 *  - The advance can never exceed the total, and the balance is always total minus advance.
 */
export const advanceConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["percent", "fixed"]),
  /** Basis points, 1..10000. Used when mode is "percent". */
  bps: z.number().int().min(1).max(10_000),
  /** Whole rupees. Used when mode is "fixed". */
  fixed: z.number().int().min(1).max(10_000_000),
  /** The advance is only asked for when the order total is at least this much (0 = always). */
  minOrder: z.number().int().min(0).max(10_000_000),
});
export type AdvanceConfig = z.infer<typeof advanceConfigSchema>;

export const defaultAdvanceConfig = (): AdvanceConfig => ({ enabled: false, mode: "percent", bps: 3333, fixed: 500, minOrder: 0 });

export const ADVANCE_PRESETS = [
  { id: "none", label: "No advance (0%)" },
  { id: "third", label: "One-third (33.33%)" },
  { id: "half", label: "Half (50%)" },
  { id: "custom_percent", label: "Custom percentage" },
  { id: "custom_fixed", label: "Custom fixed amount" },
] as const;

export interface AdvanceQuote {
  /** Paid up front, 0 when no advance applies. */
  advance: number;
  /** Collected on delivery. */
  balance: number;
  /** The percentage used, in basis points, when the advance is percentage based; otherwise null. */
  bps: number | null;
}

export function advanceFor(total: number, cfg: AdvanceConfig | null | undefined): AdvanceQuote {
  assertRupees(total, "total");
  if (!cfg || !cfg.enabled || total === 0 || total < cfg.minOrder) return { advance: 0, balance: total, bps: null };
  const raw = cfg.mode === "percent" ? Math.floor((total * cfg.bps + 9_999) / 10_000) : cfg.fixed;
  const advance = Math.max(0, Math.min(raw, total));
  return { advance, balance: total - advance, bps: cfg.mode === "percent" ? cfg.bps : null };
}

/** "33.33%" from 3333. */
export const formatBps = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
