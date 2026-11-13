import type { Queryable } from "@/lib/db";

/** Queues the "we received your payment" email, once per order. Does nothing when the customer gave no email address. */
export async function queuePaymentConfirmed(q: Queryable, orderId: string): Promise<void> {
  const r = await q.query<{ order_number: string; email: string | null }>("select order_number, email from orders where id = $1", [orderId]);
  const o = r[0];
  if (!o?.email) return;
  await q.query(
    "insert into notification_outbox(kind, recipient, payload, dedupe_key) values ('order_payment_confirmed',$1,$2,$3) on conflict (dedupe_key) do nothing",
    [o.email, JSON.stringify({ orderNumber: o.order_number }), `order_payment_confirmed:${o.order_number}`]);
}
