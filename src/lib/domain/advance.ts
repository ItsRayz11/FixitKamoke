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
/**
 * An exception to the general rule for one product or one whole category. A product rule beats a category rule, which beats the general rule.
 *  - "none":    this item never needs an advance.
 *  - "percent": a percentage of this item's share of the order (after any coupon is spread over the items).
 *  - "fixed":   a fixed amount for each unit of this item (never more than the item's share).
 */
export const advanceRuleSchema = z.object({
  kind: z.enum(["product", "category"]),
  id: z.string().uuid(),
  /** Name shown to the owner, saved with the rule so the list still reads well if the item is renamed. */
  label: z.string().trim().min(1).max(160),
  mode: z.enum(["none", "percent", "fixed"]),
  bps: z.number().int().min(1).max(10_000),
  fixed: z.number().int().min(1).max(10_000_000),
});
export type AdvanceRule = z.infer<typeof advanceRuleSchema>;

export const advanceConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["percent", "fixed"]),
  /** Basis points, 1..10000. Used when mode is "percent". */
  bps: z.number().int().min(1).max(10_000),
  /** Whole rupees. Used when mode is "fixed". */
  fixed: z.number().int().min(1).max(10_000_000),
  /** The advance is only asked for when the order total is at least this much (0 = always). */
  minOrder: z.number().int().min(0).max(10_000_000),
  /** Exceptions for particular products or categories. Empty means the general rule applies to everything. */
  rules: z.array(advanceRuleSchema).max(100).default([]),
});
export type AdvanceConfig = z.infer<typeof advanceConfigSchema>;

export const defaultAdvanceConfig = (): AdvanceConfig => ({ enabled: false, mode: "percent", bps: 3333, fixed: 500, minOrder: 0, rules: [] });

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

export interface AdvanceLine { productId: string; categoryId: string | null; lineTotal: number; quantity: number }

/** The rule for one item: a product rule beats a category rule; null means the general rule applies. */
export function ruleFor(rules: readonly AdvanceRule[], l: Pick<AdvanceLine, "productId" | "categoryId">): AdvanceRule | null {
  return rules.find((r) => r.kind === "product" && r.id === l.productId) ?? (l.categoryId ? rules.find((r) => r.kind === "category" && r.id === l.categoryId) : undefined) ?? null;
}

/**
 * The advance for a whole order, honouring product and category exceptions.
 *  - With no exception touching any item this is exactly `advanceFor(total, cfg)`.
 *  - Otherwise a coupon is spread over the items in proportion to their price (the rupee left over goes to the dearest item),
 *    each excepted item gets its own rule, and the items with no exception (plus the delivery fee) get the general rule.
 *    If every item has an exception the delivery fee carries no advance.
 *  - The "minimum order" still decides, on the final total, whether any advance is asked for at all.
 *  - The advance is whole rupees, rounded up, and never more than the total.
 * `bps` is null whenever an exception was used, because the amount is then no longer one percentage of the total.
 */
export function advanceForOrder(lines: readonly AdvanceLine[], discount: number, fee: number, total: number, cfg: AdvanceConfig | null | undefined): AdvanceQuote {
  assertRupees(total, "total");
  const rules = cfg?.rules ?? [];
  if (!cfg || rules.length === 0 || !lines.some((l) => ruleFor(rules, l))) return advanceFor(total, cfg);
  if (total === 0 || total < cfg.minOrder) return { advance: 0, balance: total, bps: null };

  const sub = lines.reduce((s, l) => s + l.lineTotal, 0);
  const share = lines.map((l) => (sub > 0 ? Math.floor((discount * l.lineTotal) / sub) : 0));
  const leftover = discount - share.reduce((s, x) => s + x, 0);
  if (leftover > 0 && lines.length > 0) share[lines.reduce((best, l, i) => (l.lineTotal > lines[best].lineTotal ? i : best), 0)] += leftover;

  let advance = 0; let generalBase = fee; let general = false;
  lines.forEach((l, i) => {
    const net = Math.max(0, l.lineTotal - share[i]);
    const rule = ruleFor(rules, l);
    if (!rule) { generalBase += net; general = true; return; }
    if (rule.mode === "percent") advance += Math.floor((net * rule.bps + 9_999) / 10_000);
    else if (rule.mode === "fixed") advance += Math.min(rule.fixed * l.quantity, net);
  });
  if (general && cfg.enabled) advance += cfg.mode === "percent" ? Math.floor((generalBase * cfg.bps + 9_999) / 10_000) : Math.min(cfg.fixed, generalBase);
  advance = Math.max(0, Math.min(advance, total));
  return { advance, balance: total - advance, bps: null };
}
