import crypto from "node:crypto";
import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { releaseRestockedAlerts } from "@/lib/stock-alerts";
import { queuePaymentConfirmed } from "@/lib/email/order-events";
import { advanceFor } from "@/lib/domain/advance";
import { formatPKR } from "@/lib/domain/money";
import { canTransition, CLOSED, RESTOCKS_ON, type OrderStatus } from "@/lib/domain/order-state";

export class OrderAdminError extends Error {}

const EMAIL_KIND: Partial<Record<OrderStatus, string>> = {
  out_for_delivery: "order_out_for_delivery",
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
    const rows = await q.query<{ order_number: string; status: OrderStatus; email: string | null; shipping_status: string; coupon_code: string | null; advance_required: number; advance_paid: number; payment_method: string; payment_status: string }>(
      "select order_number, status, email, shipping_status, coupon_code, advance_required, advance_paid, payment_method, payment_status from orders where id = $1 for update", [orderId]);
    const o = rows[0];
    if (!o) throw new OrderAdminError("Order not found.");
    if (!canTransition(o.status, to)) throw new OrderAdminError(`An order that is “${o.status.replace(/_/g, " ")}” cannot move to “${to.replace(/_/g, " ")}”.`);
    if (to === "confirmed" && o.shipping_status === "needs_confirmation") {
      throw new OrderAdminError("Confirm the delivery fee with the customer and set it on this order before confirming.");
    }
    if (to === "confirmed" && o.advance_paid < o.advance_required) {
      throw new OrderAdminError(`This cash-on-delivery order needs its ${formatPKR(o.advance_required)} advance verified before it can be confirmed.`);
    }
    // Orders paid before dispatch (transfer, wallet, online) are not confirmed until the money is verified.
    if (to === "confirmed" && o.payment_method !== "cod" && o.payment_status !== "paid") {
      throw new OrderAdminError("Check that the payment arrived and mark it paid before confirming this order.");
    }
    if (RESTOCKS_ON.includes(to)) {
      await q.query(
        "update products p set stock = p.stock + i.quantity, updated_at = now() from order_items i where i.order_id = $1 and i.product_id = p.id", [orderId]);
      await releaseRestockedAlerts(q); // someone may be waiting for exactly this item
      // An order that never happened must not use up a limited coupon.
      if (o.coupon_code) await q.query("update coupons set used_count = greatest(0, used_count - 1) where code = $1", [o.coupon_code]);
    }
    await q.query("update orders set status = $2, dispatched_at = case when $2 = 'shipped' then coalesce(dispatched_at, now()) else dispatched_at end, updated_at = now() where id = $1", [orderId, to]);
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
    const r = await q.query<{ status: string; shipping_status: string; subtotal: number; discount: number; advance_required: number; advance_bps: number | null; advance_paid: number }>(
      "select status, shipping_status, subtotal, discount, advance_required, advance_bps, advance_paid from orders where id = $1 for update", [orderId]);
    const o = r[0];
    if (!o) throw new OrderAdminError("Order not found.");
    if (o.status !== "pending_confirmation") throw new OrderAdminError("The delivery fee can only be changed before the order is confirmed.");
    if (o.shipping_status !== "needs_confirmation") throw new OrderAdminError("This order's delivery fee was already confirmed and cannot be changed here.");
    const total = o.subtotal - o.discount + fee;
    // The advance follows the terms this order was PLACED under, never today's rule:
    //  - no advance at placement: still none, even if the owner has switched the rule on since;
    //  - an advance already verified: left exactly as agreed (the larger balance is simply collected on delivery);
    //  - a percentage advance: recalculated on the new total with the same percentage; a fixed one stays the same amount (never above the total).
    let required = o.advance_required;
    if (o.advance_required > 0 && o.advance_paid === 0) {
      required = o.advance_bps !== null ? advanceFor(total, { enabled: true, mode: "percent", bps: o.advance_bps, fixed: 1, minOrder: 0, rules: [] }).advance : Math.min(o.advance_required, total);
    }
    await q.query("update orders set shipping_fee = $2, total = $3, shipping_status = 'quoted', advance_required = $4, updated_at = now() where id = $1", [orderId, fee, total, required]);
    await audit(actor, "order_shipping_fee_set", "order", orderId, { fee, advanceRequired: required }, q);
  });
}

/**
 * Manual payment status. Only the simple states can be set by hand. "Partial" comes from verifying an advance and the two refund
 * states come from recording a refund, so the money records and the status can never disagree.
 * Marking a cash-on-delivery order paid also records the cash that was still outstanding, so received money and refunds add up.
 */
export async function setPaymentStatus(db: Db, orderId: string, status: "unpaid" | "pending" | "paid" | "failed", actor: string): Promise<void> {
  if (!["unpaid", "pending", "paid", "failed"].includes(status)) throw new OrderAdminError("That status is set by the advance, cash and refund forms, not by hand.");
  await db.tx(async (q) => {
    const r = await q.query<{ order_number: string; payment_method: string; payment_status: string; total: number; advance_required: number; advance_paid: number; balance_collected: number; refunded_amount: number }>(
      "select order_number, payment_method, payment_status, total, advance_required, advance_paid, balance_collected, refunded_amount from orders where id = $1 for update", [orderId]);
    const o = r[0];
    if (!o) throw new OrderAdminError("Order not found.");
    if (o.refunded_amount > 0) throw new OrderAdminError("Part of this order has been refunded, so its payment status can no longer be changed by hand.");
    if (o.payment_method === "cod" && status !== "paid" && o.advance_paid > 0) throw new OrderAdminError("The advance on this order was verified. Use the refund form if money must go back.");
    // Cash on delivery becomes paid only by recording the cash that was actually collected (or by a fully verified advance), so the
    // money records always match what happened.
    if (status === "paid" && o.payment_method === "cod") throw new OrderAdminError("For cash on delivery, use \u201cRecord cash collected\u201d after delivery. It marks the order paid and keeps the money records right.");
    await q.query("update orders set payment_status = $2, updated_at = now() where id = $1", [orderId, status]);
    await audit(actor, "order_payment_status", "order", orderId, { status, from: o.payment_status }, q);
    if (status === "paid") await queuePaymentConfirmed(q, orderId);
  });
}

/**
 * Staff confirm that the advance for a cash-on-delivery order really arrived (they checked the bank or wallet app).
 * Records the actual amount received, who checked and when. It never confirms the order by itself: that stays a separate step.
 */
export async function verifyAdvance(db: Db, orderId: string, received: number, actor: string): Promise<void> {
  if (!Number.isSafeInteger(received) || received <= 0) throw new OrderAdminError("Enter the amount you actually received, in whole rupees.");
  await db.tx(async (q) => {
    const r = await q.query<{ order_number: string; status: string; payment_method: string; total: number; advance_required: number; advance_paid: number; email: string | null }>(
      "select order_number, status, payment_method, total, advance_required, advance_paid, email from orders where id = $1 for update", [orderId]);
    const o = r[0];
    if (!o) throw new OrderAdminError("Order not found.");
    if (o.payment_method !== "cod" || o.advance_required === 0) throw new OrderAdminError("This order does not need an advance.");
    if (["cancelled", "rejected", "returned"].includes(o.status)) throw new OrderAdminError("This order is closed.");
    if (o.advance_paid > 0) throw new OrderAdminError("The advance was already verified.");
    if (received < o.advance_required) throw new OrderAdminError(`The advance is ${formatPKR(o.advance_required)}. ${formatPKR(received)} is not enough; ask the customer for the rest first.`);
    if (received > o.total) throw new OrderAdminError(`That is more than the order total (${formatPKR(o.total)}). Check the amount.`);
    await q.query(
      "update orders set advance_paid = $2, payment_status = $3, advance_verified_at = now(), advance_verified_by = $4, updated_at = now() where id = $1",
      [orderId, received, received === o.total ? "paid" : "partial", actor]);
    await audit(actor, "advance_verified", "order", orderId, { number: o.order_number, received }, q);
    await q.query("insert into order_status_history(order_id, from_status, to_status, actor, note) values ($1,$2,$2,$3,$4)", [orderId, o.status, actor, `Advance of ${formatPKR(received)} verified`]);
    if (o.email) {
      await q.query("insert into notification_outbox(kind, recipient, payload, dedupe_key) values ('order_advance_verified',$1,$2,$3) on conflict (dedupe_key) do nothing",
        [o.email, JSON.stringify({ orderNumber: o.order_number }), `order_advance_verified:${o.order_number}`]);
    }
  });
}

const clean = (v: string, max: number) => v.trim().replace(/\s+/g, " ").slice(0, max);

/** Courier name and tracking reference, entered by hand: no courier system is connected. Shown to the customer and in the dispatch email. */
export async function setDispatchDetails(db: Db, orderId: string, carrier: string, trackingNumber: string, actor: string): Promise<void> {
  const c = clean(carrier, 60);
  const t = clean(trackingNumber, 60);
  if (!c && t) throw new OrderAdminError("Enter the courier name as well as the tracking number.");
  await db.tx(async (q) => {
    const r = await q.query<{ status: OrderStatus; order_number: string; email: string | null }>("select status, order_number, email from orders where id = $1 for update", [orderId]);
    if (!r[0]) throw new OrderAdminError("Order not found.");
    if (CLOSED.includes(r[0].status)) throw new OrderAdminError("This order is closed.");
    await q.query("update orders set carrier = $2, tracking_number = $3, updated_at = now() where id = $1", [orderId, c || null, t || null]);
    await audit(actor, "order_dispatch_details", "order", orderId, { number: r[0].order_number, carrier: c || null, hasTracking: Boolean(t) }, q);
    // If the parcel already left (the dispatch email had no courier details), tell the customer now. One email per distinct detail set.
    if (c && ["shipped", "out_for_delivery"].includes(r[0].status) && r[0].email) {
      await q.query("insert into notification_outbox(kind, recipient, payload, dedupe_key) values ('order_tracking_updated',$1,$2,$3) on conflict (dedupe_key) do nothing",
        [r[0].email, JSON.stringify({ orderNumber: r[0].order_number }), `order_tracking_updated:${r[0].order_number}:${crypto.createHash("sha256").update(`${c}|${t}`).digest("hex").slice(0, 12)}`]);
    }
  });
}

/**
 * Cash on delivery: the courier or shop collected the rest of the money. It must equal exactly what was still owed
 * (total minus the verified advance), so a short or over collection is investigated instead of silently accepted.
 */
export async function recordBalanceCollected(db: Db, orderId: string, amount: number, actor: string): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new OrderAdminError("Enter the cash you collected, in whole rupees.");
  await db.tx(async (q) => {
    const r = await q.query<{ order_number: string; status: OrderStatus; payment_method: string; total: number; advance_required: number; advance_paid: number; balance_collected: number; refunded_amount: number }>(
      "select order_number, status, payment_method, total, advance_required, advance_paid, balance_collected, refunded_amount from orders where id = $1 for update", [orderId]);
    const o = r[0];
    if (!o) throw new OrderAdminError("Order not found.");
    if (o.payment_method !== "cod") throw new OrderAdminError("Only cash-on-delivery orders have a balance to collect.");
    if (o.status !== "delivered") throw new OrderAdminError("Mark the order delivered first, then record the cash you collected.");
    if (o.balance_collected > 0) throw new OrderAdminError("The balance was already recorded.");
    if (o.refunded_amount > 0) throw new OrderAdminError("A refund was already recorded on this order, so the cash cannot be recorded now. Ask the owner to check the order.");
    if (o.advance_paid < o.advance_required) throw new OrderAdminError("The advance was never verified. Verify it before recording the balance.");
    const due = o.total - o.advance_paid;
    if (amount !== due) throw new OrderAdminError(`The balance due is ${formatPKR(due)}. ${formatPKR(amount)} does not match. Check the amount with the courier.`);
    await q.query("update orders set balance_collected = $2, balance_collected_at = now(), balance_collected_by = $3, payment_status = 'paid', updated_at = now() where id = $1", [orderId, amount, actor]);
    await audit(actor, "cod_balance_collected", "order", orderId, { number: o.order_number, amount }, q);
    await q.query("insert into order_status_history(order_id, from_status, to_status, actor, note) values ($1,$2,$2,$3,$4)", [orderId, o.status, actor, `Cash on delivery collected: ${formatPKR(amount)}`]);
  });
}

/** Money received so far, in rupees. Cash on delivery counts the verified advance plus the collected balance; other methods count the whole total once paid. */
export function receivedAmount(o: { payment_method: string; payment_status: string; total: number; advance_paid: number; balance_collected: number }): number {
  if (o.payment_method === "cod") return o.advance_paid + o.balance_collected;
  return ["paid", "refunded", "partially_refunded"].includes(o.payment_status) ? o.total : 0;
}

/**
 * Records a refund that staff already paid out (in the bank, wallet or gateway dashboard). It never moves money itself.
 * It cannot exceed what was received, so the books always add up for advance-only and fully paid orders alike.
 */
export async function recordRefund(db: Db, orderId: string, amount: number, actor: string, note?: string): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new OrderAdminError("Enter the refund amount in whole rupees.");
  await db.tx(async (q) => {
    const r = await q.query<{ order_number: string; email: string | null; status: OrderStatus; payment_method: string; payment_status: string; total: number; advance_paid: number; balance_collected: number; refunded_amount: number }>(
      "select order_number, email, status, payment_method, payment_status, total, advance_paid, balance_collected, refunded_amount from orders where id = $1 for update", [orderId]);
    const o = r[0];
    if (!o) throw new OrderAdminError("Order not found.");
    const received = receivedAmount(o);
    if (received === 0) throw new OrderAdminError("No payment has been received on this order, so there is nothing to refund.");
    const left = received - o.refunded_amount;
    if (amount > left) throw new OrderAdminError(`Only ${formatPKR(left)} can still be refunded (received ${formatPKR(received)}, already refunded ${formatPKR(o.refunded_amount)}).`);
    const total = o.refunded_amount + amount;
    const status = total === received ? "refunded" : "partially_refunded";
    await q.query("update orders set refunded_amount = $2, payment_status = $3, updated_at = now() where id = $1", [orderId, total, status]);
    await audit(actor, "order_refund_recorded", "order", orderId, { number: o.order_number, amount, totalRefunded: total, note: note ?? null }, q);
    await q.query("insert into order_status_history(order_id, from_status, to_status, actor, note) values ($1,$2,$2,$3,$4)", [orderId, o.status, actor, `Refund of ${formatPKR(amount)} recorded${note ? `: ${note}` : ""}`]);
    if (o.email) {
      await q.query("insert into notification_outbox(kind, recipient, payload, dedupe_key) values ('order_refunded',$1,$2,$3) on conflict (dedupe_key) do nothing",
        [o.email, JSON.stringify({ orderNumber: o.order_number }), `order_refunded:${o.order_number}:${total}`]);
    }
  });
}

export async function addOrderNote(db: Db, orderId: string, body: string, actor: string): Promise<void> {
  const text = body.trim();
  if (text.length < 1 || text.length > 1000) throw new OrderAdminError("A note needs 1 to 1,000 characters.");
  const r = await db.query<{ id: string }>("insert into order_notes(order_id, author, body) select id, $2, $3 from orders where id = $1 returning id", [orderId, actor, text]);
  if (!r[0]) throw new OrderAdminError("Order not found.");
  await audit(actor, "order_note_added", "order", orderId, {}, db);
}
