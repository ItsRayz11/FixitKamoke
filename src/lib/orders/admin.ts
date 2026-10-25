import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canTransition, RESTOCKS_ON, type OrderStatus } from "@/lib/domain/order-state";

export class OrderAdminError extends Error {}

const EMAIL_KIND: Partial<Record<OrderStatus, string>> = {
  confirmed: "order_confirmed",
  shipped: "order_shipped",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
  rejected: "order_cancelled",
};

/**
 * Moves an order to a new status. One transaction: lock row, validate transition, restock if the order dies,
 * write history, audit and (if the customer gave an email) queue the matching notification once.
 */
export async function transitionOrder(db: Db, orderId: string, to: OrderStatus, actor: string, note?: string): Promise<void> {
  await db.tx(async (q) => {
    const rows = await q.query<{ order_number: string; status: OrderStatus; email: string | null; shipping_status: string }>(
      "select order_number, status, email, shipping_status from orders where id = $1 for update", [orderId]);
    const o = rows[0];
    if (!o) throw new OrderAdminError("Order not found.");
    if (!canTransition(o.status, to)) throw new OrderAdminError(`An order that is “${o.status.replace(/_/g, " ")}” cannot move to “${to.replace(/_/g, " ")}”.`);
    if (to === "confirmed" && o.shipping_status === "needs_confirmation") {
      throw new OrderAdminError("Confirm the delivery fee with the customer and set it on this order before confirming.");
    }
    if (RESTOCKS_ON.includes(to)) {
      await q.query(
        "update products p set stock = p.stock + i.quantity, updated_at = now() from order_items i where i.order_id = $1 and i.product_id = p.id", [orderId]);
    }
    await q.query("update orders set status = $2, updated_at = now() where id = $1", [orderId, to]);
    await q.query("insert into order_status_history(order_id, from_status, to_status, actor, note) values ($1,$2,$3,$4,$5)", [orderId, o.status, to, actor, note ?? null]);
    await audit(actor, "order_status_changed", "order", orderId, { number: o.order_number, from: o.status, to, note: note ?? null }, q);
    const kind = EMAIL_KIND[to];
    if (kind && o.email) {
      await q.query(
        "insert into notification_outbox(kind, recipient, payload, dedupe_key) values ($1,$2,$3,$4) on conflict (dedupe_key) do nothing",
        [kind, o.email, JSON.stringify({ orderNumber: o.order_number }), `${kind}:${o.order_number}`]);
    }
  });
}

/** For orders whose delivery fee could not be quoted automatically: staff set the agreed fee. */
export async function setManualShippingFee(db: Db, orderId: string, fee: number, actor: string): Promise<void> {
  if (!Number.isSafeInteger(fee) || fee < 0 || fee > 100_000) throw new OrderAdminError("Enter a delivery fee between 0 and 100,000.");
  await db.tx(async (q) => {
    const r = await q.query<{ status: string; shipping_status: string; subtotal: number; discount: number }>(
      "select status, shipping_status, subtotal, discount from orders where id = $1 for update", [orderId]);
    const o = r[0];
    if (!o) throw new OrderAdminError("Order not found.");
    if (o.status !== "pending_confirmation") throw new OrderAdminError("The delivery fee can only be changed before the order is confirmed.");
    await q.query("update orders set shipping_fee = $2, total = $3, shipping_status = 'quoted', updated_at = now() where id = $1", [orderId, fee, o.subtotal - o.discount + fee]);
    await audit(actor, "order_shipping_fee_set", "order", orderId, { fee }, q);
  });
}

export async function setPaymentStatus(db: Db, orderId: string, status: "unpaid" | "pending" | "paid" | "refunded" | "failed", actor: string): Promise<void> {
  const r = await db.query<{ payment_status: string }>("update orders set payment_status = $2, updated_at = now() where id = $1 returning payment_status", [orderId, status]);
  if (!r[0]) throw new OrderAdminError("Order not found.");
  await audit(actor, "order_payment_status", "order", orderId, { status });
}
