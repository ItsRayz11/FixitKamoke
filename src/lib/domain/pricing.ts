import { assertRupees } from "./money";

export interface LineInput { unitPrice: number; quantity: number }
export interface Coupon {
  type: "percent" | "fixed";
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

export function couponDiscount(sub: number, c: Coupon | null): number {
  if (!c || sub < c.minSubtotal) return 0;
  let d = c.type === "percent" ? Math.floor((sub * c.value) / 100) : c.value;
  if (c.maxDiscount !== null) d = Math.min(d, c.maxDiscount);
  return Math.max(0, Math.min(d, sub));
}

export function orderTotals(lines: LineInput[], coupon: Coupon | null, shippingFee: number) {
  const sub = subtotal(lines);
  const discount = couponDiscount(sub, coupon);
  assertRupees(shippingFee, "shippingFee");
  return { subtotal: sub, discount, shippingFee, total: sub - discount + shippingFee };
}
