import crypto from "node:crypto";
import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { GatewayId } from "./index";

/** A short merchant reference that fits every gateway (JazzCash allows 20 characters): T + Pakistan-time stamp + 4 random hex digits. */
export function newReference(now = new Date()): string {
  const p = new Date(now.getTime() + 5 * 3600_000).toISOString().replace(/\D/g, "").slice(0, 14);
  return `T${p}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

export interface OrderForPayment {
  id: string; orderNumber: string; total: number; status: string; paymentMethod: string; paymentStatus: string; provider: GatewayId | null; shippingStatus: string;
}

export async function orderForPayment(db: Pick<Db, "query">, orderNumber: string, tokenHash: string): Promise<OrderForPayment | null> {
  const r = (await db.query<{ id: string; order_number: string; total: number; status: string; payment_method: string; payment_status: string; payment_provider: GatewayId | null; shipping_status: string }>(
    "select id, order_number, total, status, payment_method, payment_status, payment_provider, shipping_status from orders where order_number = $1 and tracking_token_hash = $2", [orderNumber, tokenHash]))[0];
  return r ? { id: r.id, orderNumber: r.order_number, total: r.total, status: r.status, paymentMethod: r.payment_method, paymentStatus: r.payment_status, provider: r.payment_provider, shippingStatus: r.shipping_status } : null;
}

export class PaymentStartError extends Error {}

/** Records a new attempt to pay an unpaid online order. The amount is frozen from the order total, never from the browser. */
export async function createAttempt(db: Db, o: OrderForPayment): Promise<{ id: string; reference: string; amount: number }> {
  if (o.paymentMethod !== "online" || !o.provider) throw new PaymentStartError("This order is not an online-payment order.");
  if (o.paymentStatus === "paid") throw new PaymentStartError("This order has already been paid.");
  if (["cancelled", "rejected", "returned"].includes(o.status)) throw new PaymentStartError("This order was cancelled, so it cannot be paid.");
  if (o.shippingStatus !== "quoted") throw new PaymentStartError("The delivery fee is not confirmed yet, so this order cannot be paid online.");
  for (let i = 0; i < 3; i++) {
    const reference = newReference();
    try {
      // One transaction: an attempt exists if and only if the order shows it as pending.
      return await db.tx(async (q) => {
        const r = await q.query<{ id: string }>("insert into payment_attempts(order_id, provider, reference, amount) values ($1,$2,$3,$4) returning id", [o.id, o.provider, reference, o.total]);
        await q.query("update orders set payment_status = 'pending', updated_at = now() where id = $1 and payment_status in ('unpaid','failed')", [o.id]);
        return { id: r[0].id, reference, amount: o.total };
      });
    } catch (e) {
      if (!/duplicate key/.test(e instanceof Error ? e.message : "")) throw e; // a rare reference clash: try again with a new one
    }
  }
  throw new PaymentStartError("Could not start the payment. Please try again.");
}

export async function setProviderRef(db: Pick<Db, "query">, attemptId: string, ref: string) {
  await db.query("update payment_attempts set provider_ref = $2 where id = $1", [attemptId, ref]);
}
export async function markAttemptError(db: Pick<Db, "query">, attemptId: string, error: string) {
  await db.query("update payment_attempts set status = 'failed', last_error = $2, settled_at = now() where id = $1 and status = 'created'", [attemptId, error.slice(0, 300)]);
}

export type Outcome = "paid" | "failed" | "already_paid" | "unknown_reference" | "amount_mismatch" | "order_changed" | "ignored";

export async function recordEvent(db: Pick<Db, "query">, provider: string, verified: boolean, outcome: string, reason: string | null, reference: string | null) {
  await db.query("insert into payment_events(provider, verified, outcome, reason, reference) values ($1,$2,$3,$4,$5)", [provider, verified, outcome, reason?.slice(0, 300) ?? null, reference?.slice(0, 40) ?? null]);
}

export interface Settlement {
  provider: GatewayId;
  /** Our merchant reference, or the gateway's tracker / other identifiers when the gateway does not echo our reference. */
  identifiers: string[];
  /** Amount in whole rupees as reported by the gateway, or null if it did not say. A reported amount that differs is refused. */
  amountPkr: number | null;
  /** If true the gateway must have stated an amount; used for gateways whose payload we cannot fully rely on. */
  requireAmount?: boolean;
  paid: boolean;
  providerRef: string | null;
}

/**
 * Applies a signature-verified result from a gateway. The ONLY place an order becomes "paid" online. Idempotent: repeated or
 * out-of-order notifications cannot pay an order twice, cannot undo a payment, and a result for an unknown reference changes nothing.
 */
export async function settlePayment(db: Db, s: Settlement): Promise<{ outcome: Outcome; orderNumber?: string; reference?: string }> {
  const res = await db.tx(async (q) => {
    const a = (await q.query<{ id: string; order_id: string; reference: string; amount: number; status: string }>(
      "select id, order_id, reference, amount, status from payment_attempts where provider = $1 and (reference = any($2::text[]) or provider_ref = any($2::text[])) order by created_at desc limit 1 for update",
      [s.provider, s.identifiers.length ? s.identifiers : [""]]))[0];
    if (!a) return { outcome: "unknown_reference" as Outcome, reason: "no payment of ours matches this notification" };
    const o = (await q.query<{ order_number: string; total: number; status: string; payment_status: string }>("select order_number, total, status, payment_status from orders where id = $1 for update", [a.order_id]))[0];
    if (!o) return { outcome: "unknown_reference" as Outcome, reference: a.reference, reason: "order no longer exists" };
    const base = { reference: a.reference, orderNumber: o.order_number };

    if (s.amountPkr === null && s.requireAmount) return { ...base, outcome: "amount_mismatch" as Outcome, reason: "the notification did not state an amount" };
    if (s.amountPkr !== null && s.amountPkr !== a.amount) {
      await q.query("update payment_attempts set last_error = $2 where id = $1", [a.id, `amount ${s.amountPkr} does not match expected ${a.amount}`]);
      return { ...base, outcome: "amount_mismatch" as Outcome, reason: `gateway reported ${s.amountPkr}, expected ${a.amount}` };
    }
    if (a.status === "paid") return { ...base, outcome: "already_paid" as Outcome, reason: null };

    if (s.paid) {
      if (o.total !== a.amount) return { ...base, outcome: "order_changed" as Outcome, reason: "the order total changed after the payment started" };
      await q.query("update payment_attempts set status = 'paid', provider_ref = coalesce($2, provider_ref), settled_at = now() where id = $1", [a.id, s.providerRef]);
      await q.query("update orders set payment_status = 'paid', payment_provider = $2, payment_reference = $3, updated_at = now() where id = $1", [a.order_id, s.provider, s.providerRef ?? a.reference]);
      // Money arrived for an order that was cancelled in the meantime: it still counts as paid, and staff must refund it.
      await audit(`gateway:${s.provider}`, ["cancelled", "rejected"].includes(o.status) ? "payment_received_after_cancel" : "payment_received", "order", a.order_id, { reference: a.reference, amount: a.amount }, q);
      return { ...base, outcome: "paid" as Outcome, reason: null };
    }
    if (a.status === "created") {
      await q.query("update payment_attempts set status = 'failed', settled_at = now() where id = $1", [a.id]);
      if (o.payment_status !== "paid") await q.query("update orders set payment_status = 'failed', updated_at = now() where id = $1", [a.order_id]);
    }
    return { ...base, outcome: "failed" as Outcome, reason: null };
  });
  await recordEvent(db, s.provider, true, res.outcome, "reason" in res ? res.reason ?? null : null, "reference" in res ? res.reference ?? null : null);
  return { outcome: res.outcome, orderNumber: "orderNumber" in res ? res.orderNumber : undefined, reference: "reference" in res ? res.reference : undefined };
}
