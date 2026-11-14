import type { Db, Queryable } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ACC, FinanceError, post } from "./ledger";
import { issueStock, receiveStock } from "./stock";

/**
 * Where order money lands by default. Owner can change it with a `finance` row in store_settings; wrong guesses are
 * corrected with a transfer between accounts, never by editing history.
 */
export interface FinanceDefaults { codAdvance: string; codCash: string; bank_transfer: string; online: string; jazzcash_manual: string; easypaisa_manual: string }
export const DEFAULT_ACCOUNTS: FinanceDefaults = { codAdvance: ACC.bank, codCash: ACC.cash, bank_transfer: ACC.bank, online: ACC.bank, jazzcash_manual: ACC.jazzcash, easypaisa_manual: ACC.easypaisa };

export async function getFinanceDefaults(q: Queryable): Promise<FinanceDefaults> {
  const r = await q.query<{ value: Partial<FinanceDefaults> | string }>("select value from store_settings where key = 'finance'");
  const v = r[0]?.value;
  const parsed = typeof v === "string" ? (JSON.parse(v) as Partial<FinanceDefaults>) : v;
  return { ...DEFAULT_ACCOUNTS, ...(parsed ?? {}) };
}

interface OrderRow { id: string; order_number: string; payment_method: string; payment_status: string; total: number; subtotal: number; discount: number; shipping_fee: number; advance_paid: number; balance_collected: number; refunded_amount: number; customer_id: string | null; phone: string }
const loadOrder = async (q: Queryable, id: string): Promise<OrderRow> => {
  const r = await q.query<OrderRow>(
    "select id, order_number, payment_method, payment_status, total, subtotal, discount, shipping_fee, advance_paid, balance_collected, refunded_amount, customer_id, phone from orders where id = $1", [id]);
  if (!r[0]) throw new FinanceError("Order not found.");
  return r[0];
};
const isRecognized = async (q: Queryable, orderId: string) => (await q.query("select 1 from fin_journals where idem_key = $1", [`order:${orderId}:recognized`])).length > 0;
const party = (o: OrderRow) => ({ partyType: "customer", partyId: o.customer_id ?? o.phone });

/** Order placed: record the sale in the stock ledger and freeze each line's cost. Stock itself was already reserved by checkout. */
export async function costOrderLines(q: Queryable, orderId: string): Promise<void> {
  const items = await q.query<{ id: string; product_id: string | null; quantity: number }>("select id, product_id, quantity from order_items where order_id = $1 order by id", [orderId]);
  for (const it of items) {
    if (!it.product_id) continue;
    const out = await issueStock(q, it.product_id, it.quantity, "sale", { key: `order:${orderId}:item:${it.id}:sale`, refType: "order", refId: orderId, actor: "customer" }, false);
    if (out) await q.query("update order_items set unit_cost = $2, cost_unknown_qty = $3 where id = $1", [it.id, out.unitCost, out.unknownQty]);
  }
}

/** Order cancelled or rejected before delivery: put the goods back (at the cost they left with) once. */
export async function restockOrder(q: Queryable, orderId: string, actor: string): Promise<void> {
  const items = await q.query<{ id: string; product_id: string | null; quantity: number; unit_cost: string | null; cost_unknown_qty: number | null }>(
    "select id, product_id, quantity, unit_cost, cost_unknown_qty from order_items where order_id = $1 and returned_qty = 0 order by id", [orderId]);
  for (const it of items) {
    if (!it.product_id) continue;
    await receiveStock(q, it.product_id, it.quantity, it.unit_cost == null ? null : Number(it.unit_cost), "sale_cancel",
      { key: `order:${orderId}:item:${it.id}:restock`, refType: "order", refId: orderId, actor }, it.cost_unknown_qty ?? it.quantity);
  }
}

const valuedQty = (it: { quantity: number; cost_unknown_qty: number | null; unit_cost: string | null }) =>
  it.unit_cost == null || it.cost_unknown_qty == null ? 0 : Math.max(0, it.quantity - it.cost_unknown_qty);

/**
 * Delivered: revenue is recognised now (see docs/FINANCE_PLAN.md). Money already received is a customer advance and is applied;
 * the unpaid part becomes a receivable. COGS comes from the cost frozen on each line, so later cost changes never rewrite it.
 * Safe to call again: the key makes the second call do nothing.
 */
export async function recognizeOrder(q: Queryable, orderId: string, actor: string): Promise<void> {
  const o = await loadOrder(q, orderId);
  const held = Number((await q.query<{ n: string | number }>(
    `select coalesce(sum(e.credit - e.debit),0) as n from fin_entries e join fin_journals j on j.id = e.journal_id join fin_accounts a on a.id = e.account_id
     where j.ref_type = 'order' and j.ref_id = $1 and a.code = $2`, [orderId, ACC.advances]))[0].n);
  const applied = Math.min(Math.max(held, 0), o.total);
  const items = await q.query<{ quantity: number; cost_unknown_qty: number | null; unit_cost: string | null }>("select quantity, cost_unknown_qty, unit_cost from order_items where order_id = $1", [orderId]);
  const cogs = items.reduce((s, it) => s + Math.round(valuedQty(it) * Number(it.unit_cost ?? 0)), 0);
  await post(q, {
    key: `order:${orderId}:recognized`, memo: `Sale delivered: ${o.order_number}`, refType: "order", refId: orderId, actor,
    lines: [
      { account: ACC.advances, debit: applied },
      { account: ACC.receivable, debit: o.total - applied, ...party(o) },
      { account: ACC.discounts, debit: o.discount },
      { account: ACC.sales, credit: o.subtotal },
      { account: ACC.shippingIncome, credit: o.shipping_fee },
      { account: ACC.cogs, debit: cogs },
      { account: ACC.inventory, credit: cogs },
    ],
  });
}

/**
 * Bring the ledger up to date with what the order says was received. Called after every payment action; posting only the
 * difference, keyed by the target amount, means repeated or duplicate calls (webhooks, double clicks) never double-count.
 */
export async function syncOrderReceipts(q: Queryable, orderId: string, actor: string): Promise<void> {
  const o = await loadOrder(q, orderId);
  const def = await getFinanceDefaults(q);
  const recognized = await isRecognized(q, orderId);
  const parts: { kind: string; amount: number; account: string }[] = o.payment_method === "cod"
    ? [{ kind: "advance", amount: o.advance_paid, account: def.codAdvance }, { kind: "balance", amount: o.balance_collected, account: def.codCash }]
    : [{ kind: "full", amount: ["paid", "refunded", "partially_refunded"].includes(o.payment_status) ? o.total : 0, account: def[o.payment_method as keyof FinanceDefaults] ?? def.bank_transfer }];
  for (const p of parts) {
    const posted = Number((await q.query<{ n: string | number }>(
      "select coalesce(sum(debit),0) as n from fin_entries e join fin_journals j on j.id = e.journal_id where j.idem_key like $1", [`order:${orderId}:receipt:${p.kind}:%`]))[0].n);
    const delta = p.amount - posted;
    if (delta <= 0) continue;
    // Balance collected on delivery, or anything received after recognition, settles the receivable; earlier money is an advance.
    const credit = recognized || p.kind === "balance" ? ACC.receivable : ACC.advances;
    await post(q, {
      key: `order:${orderId}:receipt:${p.kind}:${p.amount}`, memo: `Payment received: ${o.order_number}`, refType: "order", refId: orderId, actor,
      lines: [{ account: p.account, debit: delta }, { account: credit, credit: delta, ...(credit === ACC.receivable ? party(o) : {}) }],
    });
  }
}

/** A refund was paid out. Before delivery it returns an advance; after delivery it is contra-revenue, so profit is not overstated. */
export async function syncOrderRefund(q: Queryable, orderId: string, actor: string): Promise<void> {
  const o = await loadOrder(q, orderId);
  if (o.refunded_amount <= 0) return;
  const def = await getFinanceDefaults(q);
  const recognized = await isRecognized(q, orderId);
  const posted = Number((await q.query<{ n: string | number }>(
    "select coalesce(sum(credit),0) as n from fin_entries e join fin_journals j on j.id = e.journal_id join fin_accounts a on a.id = e.account_id where j.idem_key like $1 and a.kind in ('cash','bank','wallet')", [`order:${orderId}:refund:%`]))[0].n);
  const delta = o.refunded_amount - posted;
  if (delta <= 0) return;
  const account = o.payment_method === "cod" ? def.codAdvance : def[o.payment_method as keyof FinanceDefaults] ?? def.bank_transfer;
  await post(q, {
    key: `order:${orderId}:refund:${o.refunded_amount}`, memo: `Refund paid: ${o.order_number}`, refType: "order", refId: orderId, actor,
    lines: [{ account: recognized ? ACC.refunds : ACC.advances, debit: delta }, { account, credit: delta }],
  });
}

/**
 * Goods came back after delivery. Items in good condition go back to stock at the cost they left with and COGS is reversed for the
 * valued part; damaged goods are not restocked (their cost stays expensed). Repeat calls cannot restock the same units twice.
 */
export async function returnOrderGoods(db: Db, orderId: string, returns: { itemId: string; goodQty: number }[], actor: string): Promise<void> {
  await db.tx(async (q) => {
    const o = await loadOrder(q, orderId);
    if (!(await isRecognized(q, orderId))) throw new FinanceError("Only a delivered order can have goods returned. Cancel the order instead.");
    let reverseCogs = 0;
    for (const r of returns) {
      if (!Number.isSafeInteger(r.goodQty) || r.goodQty < 0) throw new FinanceError("Returned quantity must be zero or more.");
      if (r.goodQty === 0) continue;
      const it = (await q.query<{ id: string; product_id: string | null; quantity: number; returned_qty: number; unit_cost: string | null; cost_unknown_qty: number | null }>(
        "select id, product_id, quantity, returned_qty, unit_cost, cost_unknown_qty from order_items where id = $1 and order_id = $2 for update", [r.itemId, orderId]))[0];
      if (!it) throw new FinanceError("That order line was not found.");
      if (it.returned_qty + r.goodQty > it.quantity) throw new FinanceError(`Only ${it.quantity - it.returned_qty} of this item can still be returned.`);
      const valuedTotal = valuedQty(it);
      const valuedThis = Math.min(r.goodQty, Math.max(0, valuedTotal - it.returned_qty));
      const cost = it.unit_cost == null ? null : Number(it.unit_cost);
      if (it.product_id) {
        await receiveStock(q, it.product_id, r.goodQty, cost, "return", { key: `order:${orderId}:item:${it.id}:return:${it.returned_qty + r.goodQty}`, refType: "order", refId: orderId, actor }, r.goodQty - valuedThis);
      }
      await q.query("update order_items set returned_qty = returned_qty + $2 where id = $1", [it.id, r.goodQty]);
      reverseCogs += Math.round(valuedThis * (cost ?? 0));
    }
    await post(q, {
      key: `order:${orderId}:cogs-return:${returns.map((r) => `${r.itemId}=${r.goodQty}`).sort().join(",")}:${o.refunded_amount}`,
      memo: `Goods returned: ${o.order_number}`, refType: "order", refId: orderId, actor,
      lines: [{ account: ACC.inventory, debit: reverseCogs }, { account: ACC.cogs, credit: reverseCogs }],
    });
    await audit(actor, "order_goods_returned", "order", orderId, { returns }, q);
  });
}
