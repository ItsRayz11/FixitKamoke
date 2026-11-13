import type { Queryable } from "@/lib/db";
import type { Coupon } from "@/lib/domain/pricing";

export interface CouponRow {
  id: string; code: string; type: "percent" | "fixed" | "freeship"; value: number; min_subtotal: number; max_discount: number | null; active: boolean;
  starts_at: Date | string | null; expires_at: Date | string | null; usage_limit: number | null; used_count: number;
  per_customer_limit: number | null; allow_with_sale: boolean; category_id: string | null;
}

export async function findCoupon(q: Queryable, code: string): Promise<CouponRow | null> {
  const rows = await q.query<CouponRow>(
    `select id, code, type, value, min_subtotal, max_discount, active, starts_at, expires_at, usage_limit, used_count, per_customer_limit, allow_with_sale, category_id
       from coupons where upper(code) = upper($1)`, [code.trim()]);
  return rows[0] ?? null;
}

export interface CouponContext {
  subtotal: number;
  /** True when any line is on a sale price that is in force. */
  hasSaleItem: boolean;
  /** Subtotal of the lines the coupon applies to (the whole subtotal unless the coupon is limited to a category). */
  eligibleSubtotal: number;
  /** How many live (not cancelled or rejected) orders this customer already placed with this code. */
  usedByCustomer: number;
  now?: Date;
}

/** A customer-readable reason the coupon cannot be used, or null when it can. */
export function couponProblem(c: CouponRow | null, ctx: CouponContext): string | null {
  if (!c || !c.active) return "That coupon code is not valid.";
  const now = ctx.now ?? new Date();
  if (c.starts_at && new Date(c.starts_at) > now) return "That coupon is not active yet.";
  if (c.expires_at && new Date(c.expires_at) <= now) return "That coupon has expired.";
  if (c.usage_limit !== null && c.used_count >= c.usage_limit) return "That coupon has been fully used.";
  if (c.per_customer_limit !== null && ctx.usedByCustomer >= c.per_customer_limit) return "You have already used this coupon the maximum number of times.";
  if (ctx.subtotal < c.min_subtotal) return `This coupon needs an order of at least Rs. ${c.min_subtotal.toLocaleString("en-PK")}.`;
  if (!c.allow_with_sale && ctx.hasSaleItem) return "This coupon cannot be used together with sale prices.";
  if (c.category_id && ctx.eligibleSubtotal <= 0) return "This coupon does not apply to the items in your cart.";
  return null;
}

export const toPricingCoupon = (c: CouponRow): Coupon => ({ type: c.type, value: c.value, minSubtotal: c.min_subtotal, maxDiscount: c.max_discount });

/** Live orders that already used this code, matched by phone number or signed-in account. */
export async function countCustomerUses(q: Queryable, code: string, phone: string | null, customerId: string | null): Promise<number> {
  if (!phone && !customerId) return 0;
  const r = await q.query<{ n: number }>(
    `select count(*)::int as n from orders where upper(coupon_code) = upper($1) and status not in ('cancelled','rejected')
       and (($2::text is not null and phone = $2) or ($3::uuid is not null and customer_id = $3))`, [code, phone, customerId]);
  return r[0]?.n ?? 0;
}
