import { z } from "zod";
import type { Db } from "@/lib/db";

export class StockAlertError extends Error {}

const emailSchema = z.string().trim().toLowerCase().email("Please enter a valid email address").max(200);

/** Anything that can run a query: the database itself or a transaction handle. */
type Q = Pick<Db, "query">;

/**
 * Records a request for one "back in stock" email. Only for an item that is sold out right now, so a visitor is never
 * told to wait for something they could simply buy. Asking again for the same item just refreshes the request.
 */
export async function requestStockAlert(db: Db, productId: string, email: string): Promise<void> {
  const e = emailSchema.safeParse(email);
  if (!e.success) throw new StockAlertError(e.error.issues[0].message);
  const p = (await db.query<{ stock: number; published: boolean }>("select stock, published from products where id = $1", [String(productId)]))[0];
  if (!p || !p.published) throw new StockAlertError("We could not find that product.");
  if (p.stock > 0) throw new StockAlertError("Good news: this is in stock now, so you can order it today.");
  await db.query(
    `insert into stock_alerts(product_id, email) values ($1, $2)
     on conflict (product_id, email) do update set notified_at = null, created_at = now()`, [productId, e.data]);
}

/**
 * Queues the one-time email for every waiting request whose item now has stock, and returns how many were queued.
 * It looks at the data rather than at who changed it, so every way stock can come back (editing the product, the
 * inventory page, a cancelled order restocking) is covered by calling this afterwards. Safe to call repeatedly.
 */
export async function releaseRestockedAlerts(q: Q): Promise<number> {
  const rows = await q.query<{ id: string }>(
    `with due as (
       update stock_alerts a set notified_at = now() from products p
       where a.product_id = p.id and a.notified_at is null and p.published and p.stock > 0
       returning a.id, a.email, a.product_id)
     insert into notification_outbox(kind, recipient, payload, dedupe_key)
     select 'back_in_stock', email, jsonb_build_object('productId', product_id::text), 'stock:' || id::text || ':' || gen_random_uuid()::text from due
     on conflict (dedupe_key) do nothing
     returning id`);
  // The promise made on the form: the address is used for this one message and removed within 30 days.
  await q.query("delete from stock_alerts where notified_at < now() - interval '30 days'");
  await q.query("delete from notification_outbox where kind = 'back_in_stock' and status in ('sent','failed') and created_at < now() - interval '30 days'");
  return rows.length;
}

/** Number of people waiting for each product, for the inventory page. */
export async function waitingCounts(db: Db): Promise<Record<string, number>> {
  const r = await db.query<{ product_id: string; n: number }>("select product_id, count(*)::int as n from stock_alerts where notified_at is null group by product_id");
  return Object.fromEntries(r.map((x) => [x.product_id, x.n]));
}
