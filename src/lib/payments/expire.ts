import type { Db } from "@/lib/db";
import { transitionOrder } from "@/lib/orders/admin";

/**
 * An online order that nobody paid for keeps its items off the shelf. After `hours` without a payment it is cancelled (which puts the
 * stock back), so an abandoned checkout cannot lock up limited stock. Orders with a paid attempt, or any order a person has already
 * moved on from "waiting for confirmation", are never touched. Returns how many were cancelled.
 */
export async function expireUnpaidOnlineOrders(db: Db, hours = 24): Promise<number> {
  const stale = await db.query<{ id: string }>(
    `select o.id from orders o
     where o.payment_method = 'online' and o.status = 'pending_confirmation' and o.payment_status in ('unpaid','pending','failed')
       and o.created_at < now() - ($1 || ' hours')::interval
       and not exists (select 1 from payment_attempts a where a.order_id = o.id and a.status = 'paid')
     limit 50`, [String(hours)]);
  let n = 0;
  for (const o of stale) {
    try { await transitionOrder(db, o.id, "cancelled", "system", `No online payment was received within ${hours} hours.`); n++; } catch { /* already changed by a person: leave it */ }
  }
  return n;
}
