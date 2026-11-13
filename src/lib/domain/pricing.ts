import { assertRupees } from "./money";

export interface LineInput { unitPrice: number; quantity: number }
export interface Coupon {
  type: "percent" | "fixed" | "freeship";
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
}

export function lineTotal(l: LineInput): number {
  assertRupees(l.unitPrice, "unitPrice");
  if (!Number.isSafeInteger(l.quantity) || l.quantity < 1) throw new RangeError("quantity must be a positive integer");
  return l.unitPrice * l.quantity;
}

export function subtotal(lines: LineInput[]): number {
  return lines.reduce((s, l) => s + lineTotal(l), 0);
}

/**
 * The coupon saving, in whole rupees. Order of calculation (documented policy):
 *   1. Line prices already include any sale price that is in force.
 *   2. The coupon's minimum is checked against the whole subtotal.
 *   3. A percentage or fixed coupon applies to the "eligible" subtotal (the whole subtotal, or only the lines in the coupon's category),
 *      capped by the maximum discount and never more than that eligible subtotal.
 *   4. A free-delivery coupon takes off the delivery fee only.
 *   5. Delivery is added after the product discount: total = subtotal - saving + delivery.
 */
export function couponDiscount(sub: number, c: Coupon | null, shippingFee = 0, eligibleSub: number = sub): number {
  if (!c || sub < c.minSubtotal) return 0;
  if (c.type === "freeship") return Math.max(0, shippingFee);
  let d = c.type === "percent" ? Math.floor((eligibleSub * c.value) / 100) : c.value;
  if (c.maxDiscount !== null) d = Math.min(d, c.maxDiscount);
  return Math.max(0, Math.min(d, eligibleSub));
}

export function orderTotals(lines: LineInput[], coupon: Coupon | null, shippingFee: number, eligibleSub?: number) {
  const sub = subtotal(lines);
  assertRupees(shippingFee, "shippingFee");
  const discount = couponDiscount(sub, coupon, shippingFee, eligibleSub ?? sub);
  return { subtotal: sub, discount, shippingFee, total: sub - discount + shippingFee };
}
