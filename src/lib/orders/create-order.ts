import crypto from "node:crypto";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { normalizePkMobile } from "@/lib/domain/phone";
import { orderTotals, type Coupon } from "@/lib/domain/pricing";
import { quoteShipping, type ShippingConfig } from "@/lib/domain/shipping";

export const checkoutSchema = z.object({
  idempotencyKey: z.string().min(16).max(100),
  customerName: z.string().trim().min(2, "Please enter your full name").max(100, "That name is too long"),
  phone: z.string().trim().min(10, "Please enter a valid Pakistani mobile number.").max(20, "Please enter a valid Pakistani mobile number."),
  email: z.string().trim().email("Please enter a valid email address").max(200).optional().or(z.literal("").transform(() => undefined)),
  city: z.string().trim().min(2, "Please enter your city").max(80),
  area: z.string().trim().max(120).optional(),
  address: z.string().trim().min(8, "Please enter your complete delivery address").max(500, "That address is too long"),
  notes: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(["cod", "bank_transfer"]),
  couponCode: z.string().trim().max(40).optional(),
  // Only product id + quantity are accepted from the browser. Prices never are.
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(50),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export class CheckoutError extends Error {
  constructor(public code: "invalid_phone" | "out_of_stock" | "unavailable" | "not_serviceable" | "cod_unavailable" | "bad_coupon" | "shipping_unconfigured", message: string, public detail?: unknown) {
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
  duplicate: boolean;
}

export async function getShippingConfig(db: Pick<Db, "query">): Promise<ShippingConfig | null> {
  const rows = await db.query<{ value: ShippingConfig }>("select value from store_settings where key = 'shipping'");
  return rows[0]?.value ?? null;
}

/** `opts.customerId` comes from the signed-in session on the server, never from the browser form. */
export async function createOrder(db: Db, raw: unknown, opts: { customerId?: string } = {}): Promise<CreatedOrder> {
  const input = checkoutSchema.parse(raw);
  const phone = normalizePkMobile(input.phone);
  if (!phone) throw new CheckoutError("invalid_phone", "Please enter a valid Pakistani mobile number.");

  return db.tx(async (q) => {
    const existing = await q.query<{ order_number: string; total: number; shipping_fee: number; shipping_status: "quoted" | "needs_confirmation" }>(
      "select order_number, total, shipping_fee, shipping_status from orders where idempotency_key = $1",
      [input.idempotencyKey],
    );
    if (existing[0]) {
      const e = existing[0];
      return { orderNumber: e.order_number, trackingToken: null, total: e.total, shippingFee: e.shipping_fee, shippingStatus: e.shipping_status, duplicate: true };
    }

    const config = await getShippingConfig(q);
    if (!config) throw new CheckoutError("shipping_unconfigured", "Delivery has not been configured yet.");

    // Merge duplicate lines, then lock and read authoritative product data.
    const qty = new Map<string, number>();
    for (const i of input.items) qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity);

    const lines: { productId: string; name: string; sku: string | null; unitPrice: number; quantity: number }[] = [];
    for (const [productId, quantity] of qty) {
      // Atomic guard: decrement only if published and enough stock. No oversell possible even under concurrency.
      const rows = await q.query<{ name: string; sku: string | null; price: number; sale_price: number | null }>(
        "update products set stock = stock - $2, updated_at = now() where id = $1 and published and stock >= $2 returning name, sku, price, sale_price",
        [productId, quantity],
      );
      if (!rows[0]) {
        const p = await q.query<{ name: string; stock: number; published: boolean }>("select name, stock, published from products where id = $1", [productId]);
        if (!p[0] || !p[0].published) throw new CheckoutError("unavailable", "A product in your cart is no longer available.", { productId });
        throw new CheckoutError("out_of_stock", `Only ${p[0].stock} of "${p[0].name}" left in stock.`, { productId, available: p[0].stock });
      }
      const r = rows[0];
      lines.push({ productId, name: r.name, sku: r.sku, unitPrice: r.sale_price ?? r.price, quantity });
    }

    let coupon: Coupon | null = null;
    let couponCode: string | null = null;
    if (input.couponCode) {
      const c = await q.query<{ code: string; type: "percent" | "fixed"; value: number; min_subtotal: number; max_discount: number | null }>(
        "update coupons set used_count = used_count + 1 where upper(code) = upper($1) and active and (expires_at is null or expires_at > now()) and (usage_limit is null or used_count < usage_limit) returning code, type, value, min_subtotal, max_discount",
        [input.couponCode],
      );
      if (!c[0]) throw new CheckoutError("bad_coupon", "That coupon code is not valid.");
      coupon = { type: c[0].type, value: c[0].value, minSubtotal: c[0].min_subtotal, maxDiscount: c[0].max_discount };
      couponCode = c[0].code;
    }

    const sub = orderTotals(lines, null, 0).subtotal;
    const quote = quoteShipping(config, input.city, sub);
    if (quote.status === "not_serviceable") throw new CheckoutError("not_serviceable", "We cannot deliver to this city yet.");
    if (quote.status === "quoted" && input.paymentMethod === "cod" && !quote.codAvailable) {
      throw new CheckoutError("cod_unavailable", "Cash on delivery is not available for this city.");
    }
    const fee = quote.status === "quoted" ? quote.fee : 0;
    const totals = orderTotals(lines, coupon, fee);
    if (couponCode && totals.discount === 0) throw new CheckoutError("bad_coupon", "Your order does not meet this coupon's minimum.");

    const orderNumber = "FX-" + crypto.randomBytes(5).toString("hex").toUpperCase();
    const token = crypto.randomBytes(24).toString("base64url");
    const [{ id: orderId }] = await q.query<{ id: string }>(
      `insert into orders (order_number, idempotency_key, tracking_token_hash, customer_name, phone, email, city, area, address, notes,
         payment_method, coupon_code, subtotal, discount, shipping_fee, total, shipping_status, shipping_policy_version, customer_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning id`,
      [orderNumber, input.idempotencyKey, sha256(token), input.customerName, phone, input.email ?? null, input.city, input.area ?? null, input.address, input.notes ?? null,
        input.paymentMethod, couponCode, totals.subtotal, totals.discount, totals.shippingFee, totals.total, quote.status, config.version, opts.customerId ?? null],
    );
    for (const l of lines) {
      await q.query(
        "insert into order_items (order_id, product_id, product_name, sku, unit_price, quantity, line_total) values ($1,$2,$3,$4,$5,$6,$7)",
        [orderId, l.productId, l.name, l.sku, l.unitPrice, l.quantity, l.unitPrice * l.quantity],
      );
    }
    await q.query("insert into order_status_history (order_id, from_status, to_status, actor) values ($1, null, 'pending_confirmation', 'customer')", [orderId]);
    if (input.email) {
      await q.query(
        "insert into notification_outbox (kind, recipient, payload, dedupe_key) values ('order_received', $1, $2, $3) on conflict (dedupe_key) do nothing",
        [input.email, JSON.stringify({ orderNumber }), `order_received:${orderNumber}`],
      );
    }
    return { orderNumber, trackingToken: token, total: totals.total, shippingFee: totals.shippingFee, shippingStatus: quote.status, duplicate: false };
  });
}
