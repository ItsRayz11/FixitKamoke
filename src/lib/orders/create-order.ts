import crypto from "node:crypto";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { normalizePkMobile } from "@/lib/domain/phone";
import { orderTotals, type Coupon } from "@/lib/domain/pricing";
import { saleNowSql } from "@/lib/domain/sale";
import { countCustomerUses, couponProblem, findCoupon, toPricingCoupon } from "@/lib/orders/coupons";
import { quoteShipping, type ShippingConfig } from "@/lib/domain/shipping";
import { getPaymentOptions } from "@/lib/payments";
import { getAdvanceConfig } from "@/lib/payments/advance";
import { advanceForOrder } from "@/lib/domain/advance";
import { queueStaffAlert } from "@/lib/email/alerts";
import { displayName } from "@/lib/domain/display";
import { paymentLabel } from "@/lib/domain/payment-label";
import { crossedIntoLow } from "@/lib/domain/stock";

export const checkoutSchema = z.object({
  idempotencyKey: z.string().min(16).max(100),
  customerName: z.string().trim().min(2, "Please enter your full name").max(100, "That name is too long"),
  phone: z.string().trim().min(10, "Please enter a valid Pakistani mobile number.").max(20, "Please enter a valid Pakistani mobile number."),
  email: z.string().trim().email("Please enter a valid email address").max(200).optional().or(z.literal("").transform(() => undefined)),
  city: z.string().trim().min(2, "Please enter your city").max(80),
  area: z.string().trim().max(120).optional(),
  address: z.string().trim().min(8, "Please enter your complete delivery address").max(500, "That address is too long"),
  notes: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(["cod", "bank_transfer", "online", "jazzcash_manual", "easypaisa_manual"]),
  /** Which gateway, when paying online. Checked against the gateways that are really live. */
  paymentProvider: z.enum(["safepay", "jazzcash", "easypaisa"]).optional(),
  couponCode: z.string().trim().max(40).optional(),
  // Only product id + quantity are accepted from the browser. Prices never are.
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(50),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export class CheckoutError extends Error {
  constructor(public code: "invalid_phone" | "payment_unavailable" | "out_of_stock" | "unavailable" | "not_serviceable" | "cod_unavailable" | "bad_coupon" | "shipping_unconfigured", message: string, public detail?: unknown) {
    super(message);
  }
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const hashToken = sha256;

export interface CreatedOrder {
  orderNumber: string;
  trackingToken: string | null; // plaintext only on first creation; null when an idempotent retry returns an existing order
  total: number;
  shippingFee: number;
  shippingStatus: "quoted" | "needs_confirmation";
  /** Rupees the customer must pay up front before a COD order can be confirmed. 0 means none. */
  advanceRequired: number;
  duplicate: boolean;
}

export async function getShippingConfig(db: Pick<Db, "query">): Promise<ShippingConfig | null> {
  const rows = await db.query<{ value: ShippingConfig }>("select value from store_settings where key = 'shipping'");
  return rows[0]?.value ?? null;
}

/** `opts.customerId` comes from the signed-in session on the server, never from the browser form. */
export async function createOrder(db: Db, raw: unknown, opts: { customerId?: string; staff?: boolean } = {}): Promise<CreatedOrder> {
  const input = checkoutSchema.parse(raw);
  const phone = normalizePkMobile(input.phone);
  if (!phone) throw new CheckoutError("invalid_phone", "Please enter a valid Pakistani mobile number.");

  return db.tx(async (q) => {
    const existing = await q.query<{ order_number: string; total: number; shipping_fee: number; shipping_status: "quoted" | "needs_confirmation"; advance_required: number }>(
      "select order_number, total, shipping_fee, shipping_status, advance_required from orders where idempotency_key = $1",
      [input.idempotencyKey],
    );
    if (existing[0]) {
      const e = existing[0];
      return { orderNumber: e.order_number, trackingToken: null, total: e.total, shippingFee: e.shipping_fee, shippingStatus: e.shipping_status, advanceRequired: e.advance_required, duplicate: true };
    }

    const methods = await getPaymentOptions(q, { staff: opts.staff });
    if ((input.paymentMethod === "cod" && !methods.cod) || (input.paymentMethod === "bank_transfer" && !methods.bankTransfer)
      || ((input.paymentMethod === "jazzcash_manual" || input.paymentMethod === "easypaisa_manual") && !methods.wallets.includes(input.paymentMethod))
      || (input.paymentMethod === "online" && !(input.paymentProvider && methods.online.includes(input.paymentProvider)))) {
      throw new CheckoutError("payment_unavailable", "That payment method is not available right now. Please choose another.");
    }

    const config = await getShippingConfig(q);
    if (!config) throw new CheckoutError("shipping_unconfigured", "Delivery has not been configured yet.");

    // Merge duplicate lines, then lock and read authoritative product data.
    const qty = new Map<string, number>();
    for (const i of input.items) qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity);

    const lines: { productId: string; name: string; sku: string | null; unitPrice: number; quantity: number; categoryId: string | null; onSale: boolean }[] = [];
    for (const [productId, quantity] of qty) {
      // Atomic guard: decrement only if published and enough stock. No oversell possible even under concurrency.
      const rows = await q.query<{ name: string; sku: string | null; price: number; sale_price: number | null; variant_label: string | null; category_id: string | null; stock: number }>(
        `update products set stock = stock - $2, updated_at = now() where id = $1 and published and stock >= $2 returning name, sku, price, ${saleNowSql("")} as sale_price, variant_label, category_id, stock`,
        [productId, quantity],
      );
      if (!rows[0]) {
        const p = await q.query<{ name: string; stock: number; published: boolean }>("select name, stock, published from products where id = $1", [productId]);
        if (!p[0] || !p[0].published) throw new CheckoutError("unavailable", "A product in your cart is no longer available.", { productId });
        throw new CheckoutError("out_of_stock", `Only ${p[0].stock} of "${p[0].name}" left in stock.`, { productId, available: p[0].stock });
      }
      const r = rows[0];
      if (crossedIntoLow(r.stock + quantity, r.stock)) await queueStaffAlert(q, "stock", `${productId.slice(0, 8)}-${r.stock}`, `${displayName(r.name, r.variant_label)}: ${r.stock === 0 ? "sold out" : `only ${r.stock} left`}`);
      lines.push({ productId, name: displayName(r.name, r.variant_label), sku: r.sku, unitPrice: r.sale_price ?? r.price, quantity, categoryId: r.category_id, onSale: r.sale_price !== null });
    }

    const sub = orderTotals(lines, null, 0).subtotal;
    const quote = quoteShipping(config, input.city, sub);
    if (quote.status === "not_serviceable") throw new CheckoutError("not_serviceable", "We cannot deliver to this city yet.");
    if (input.paymentMethod === "online" && quote.status !== "quoted") {
      // The amount charged must be the final amount. An unquoted delivery fee is still to be agreed, so it cannot be paid online yet.
      throw new CheckoutError("payment_unavailable", "Online payment needs a confirmed delivery fee. Please choose cash on delivery or bank transfer, and we will confirm the fee with you.");
    }
    if (quote.status === "quoted" && input.paymentMethod === "cod" && !quote.codAvailable) {
      throw new CheckoutError("cod_unavailable", "Cash on delivery is not available for this city.");
    }
    const fee = quote.status === "quoted" ? quote.fee : 0;

    // Coupon: every rule is checked here on the server, from the database, never from the browser.
    let coupon: Coupon | null = null;
    let couponCode: string | null = null;
    let eligible = sub;
    if (input.couponCode) {
      const row = await findCoupon(q, input.couponCode);
      eligible = row?.category_id ? lines.filter((l) => l.categoryId === row.category_id).reduce((a, l) => a + l.unitPrice * l.quantity, 0) : sub;
      const problem = couponProblem(row, {
        subtotal: sub, hasSaleItem: lines.some((l) => l.onSale), eligibleSubtotal: eligible,
        usedByCustomer: row ? await countCustomerUses(q, row.code, phone, opts.customerId ?? null) : 0,
      });
      if (problem) throw new CheckoutError("bad_coupon", problem);
      // Claim one use atomically so two simultaneous orders cannot both take the last use.
      const claimed = await q.query("update coupons set used_count = used_count + 1 where id = $1 and (usage_limit is null or used_count < usage_limit) returning id", [row!.id]);
      if (!claimed[0]) throw new CheckoutError("bad_coupon", "That coupon has been fully used.");
      coupon = toPricingCoupon(row!);
      couponCode = row!.code;
    }
    const totals = orderTotals(lines, coupon, fee, eligible);
    if (couponCode && totals.discount === 0) throw new CheckoutError("bad_coupon", "This coupon would not reduce your order (for example, delivery is already free or not confirmed yet).");

    // Advance for cash on delivery, worked out here from the final total. The browser never supplies it.
    // Needs a confirmed delivery fee: an unquoted fee changes the total, and staff recompute the advance when they set it.
    const adv = input.paymentMethod === "cod" && !(quote.status === "quoted" && !quote.advanceApplies) ? advanceForOrder(lines.map((l) => ({ productId: l.productId, categoryId: l.categoryId, lineTotal: l.unitPrice * l.quantity, quantity: l.quantity })), totals.discount, totals.shippingFee, totals.total, await getAdvanceConfig(q)) : { advance: 0, bps: null };

    const orderNumber = "FX-" + crypto.randomBytes(5).toString("hex").toUpperCase();
    const token = crypto.randomBytes(24).toString("base64url");
    const [{ id: orderId }] = await q.query<{ id: string }>(
      `insert into orders (order_number, idempotency_key, tracking_token_hash, customer_name, phone, email, city, area, address, notes,
         payment_method, coupon_code, subtotal, discount, shipping_fee, total, shipping_status, shipping_policy_version, customer_id, payment_provider, payment_status, advance_required, advance_bps)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) returning id`,
      [orderNumber, input.idempotencyKey, sha256(token), input.customerName, phone, input.email ?? null, input.city, input.area ?? null, input.address, input.notes ?? null,
        input.paymentMethod, couponCode, totals.subtotal, totals.discount, totals.shippingFee, totals.total, quote.status, config.version, opts.customerId ?? null,
        input.paymentMethod === "online" ? input.paymentProvider! : null, input.paymentMethod === "online" ? "pending" : "unpaid", adv.advance, adv.bps],
    );
    for (const l of lines) {
      await q.query(
        "insert into order_items (order_id, product_id, product_name, sku, unit_price, quantity, line_total) values ($1,$2,$3,$4,$5,$6,$7)",
        [orderId, l.productId, l.name, l.sku, l.unitPrice, l.quantity, l.unitPrice * l.quantity],
      );
    }
    await q.query("insert into order_status_history (order_id, from_status, to_status, actor) values ($1, null, 'pending_confirmation', 'customer')", [orderId]);
    await q.query("insert into analytics_events(name, path) values ('order_placed', '/checkout')");
    await queueStaffAlert(q, "order", orderNumber, `${lines.reduce((s, l) => s + l.quantity, 0)} item(s), ${new Intl.NumberFormat("en-PK").format(totals.total)} PKR, ${input.paymentMethod === "cod" ? (adv.advance > 0 ? `cash on delivery, advance of ${new Intl.NumberFormat("en-PK").format(adv.advance)} PKR required first` : "cash on delivery") : input.paymentMethod === "online" ? `online payment via ${input.paymentProvider} (awaiting payment)` : paymentLabel(input.paymentMethod).toLowerCase()}, ${input.city.slice(0, 40)}`);
    if (input.email) {
      await q.query(
        "insert into notification_outbox (kind, recipient, payload, dedupe_key) values ('order_received', $1, $2, $3) on conflict (dedupe_key) do nothing",
        [input.email, JSON.stringify({ orderNumber }), `order_received:${orderNumber}`],
      );
    }
    return { orderNumber, trackingToken: token, total: totals.total, shippingFee: totals.shippingFee, shippingStatus: quote.status, advanceRequired: adv.advance, duplicate: false };
  });
}
