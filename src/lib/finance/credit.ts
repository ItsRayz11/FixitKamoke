import type { Db, Queryable } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ACC, FinanceError, post } from "./ledger";

export class CreditLimitError extends FinanceError {}

export async function ensureParty(q: Queryable, p: { kind: "customer" | "supplier"; name: string; phone?: string | null; customerId?: string | null; supplierId?: string | null }): Promise<string> {
  const found = p.supplierId
    ? await q.query<{ id: string }>("select id from credit_parties where supplier_id = $1", [p.supplierId])
    : p.customerId
      ? await q.query<{ id: string }>("select id from credit_parties where customer_id = $1", [p.customerId])
      : p.phone
        ? await q.query<{ id: string }>("select id from credit_parties where kind = $1 and phone = $2 and customer_id is null and supplier_id is null limit 1", [p.kind, p.phone])
        : [];
  if (found[0]) return found[0].id;
  const r = await q.query<{ id: string }>(
    "insert into credit_parties(kind, name, phone, customer_id, supplier_id) values ($1,$2,$3,$4,$5) returning id",
    [p.kind, p.name.trim() || "Unnamed", p.phone ?? null, p.customerId ?? null, p.supplierId ?? null]);
  return r[0].id;
}

export async function setCreditLimit(db: Db, partyId: string, limit: number | null, actor: string): Promise<void> {
  if (limit != null && (!Number.isSafeInteger(limit) || limit < 0)) throw new FinanceError("Enter a limit in whole rupees, or leave it empty for no limit.");
  await db.tx(async (q) => {
    await q.query("update credit_parties set credit_limit = $2 where id = $1", [partyId, limit]);
    await audit(actor, "credit_limit_set", "credit_party", partyId, { limit }, q);
  });
}

export async function outstanding(q: Queryable, partyId: string): Promise<number> {
  const r = await q.query<{ n: string | number }>("select coalesce(sum(amount - paid),0) as n from credit_items where party_id = $1 and status = 'open'", [partyId]);
  return Number(r[0].n);
}

/**
 * Record money owed to us (receivable) or by us (payable). Creates the item only: the journal for the underlying sale/purchase is posted
 * by that flow, so an unpaid credit sale raises receivables and sales without adding any cash.
 * A customer over their credit limit is refused unless the owner approves (allowOverLimit).
 */
export async function createCreditItem(q: Queryable, i: { partyId: string; direction: "receivable" | "payable"; sourceType: string; sourceId?: string; amount: number; dueDate?: string | null; note?: string; allowOverLimit?: boolean }): Promise<string> {
  if (!Number.isSafeInteger(i.amount) || i.amount <= 0) throw new FinanceError("Credit amount must be more than zero.");
  if (i.direction === "receivable" && !i.allowOverLimit) {
    const lim = (await q.query<{ credit_limit: number | null }>("select credit_limit from credit_parties where id = $1", [i.partyId]))[0]?.credit_limit;
    if (lim != null && (await outstanding(q, i.partyId)) + i.amount > lim) throw new CreditLimitError(`This would take the customer over their credit limit of Rs. ${lim.toLocaleString("en-PK")}. The owner must approve it.`);
  }
  const r = await q.query<{ id: string }>(
    "insert into credit_items(party_id, direction, source_type, source_id, amount, due_date, note) values ($1,$2,$3,$4,$5,$6,$7) returning id",
    [i.partyId, i.direction, i.sourceType, i.sourceId ?? null, i.amount, i.dueDate ?? null, i.note ?? null]);
  return r[0].id;
}

/**
 * A (partial) repayment. Receivable: money comes in (Dr money, Cr Receivables). Payable: money goes out (Dr Payables, Cr money).
 * Idempotent by key; over-paying an item is refused.
 */
export async function payCredit(db: Db, itemId: string, amount: number, accountCode: string, actor: string, key: string): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new FinanceError("Enter an amount greater than zero.");
  await db.tx(async (q) => {
    const done = await q.query("select 1 from credit_payments where idem_key = $1", [key]);
    if (done[0]) return;
    const it = (await q.query<{ direction: "receivable" | "payable"; amount: number; paid: number; status: string; party_id: string; source_type: string; source_id: string | null }>(
      "select direction, amount, paid, status, party_id, source_type, source_id from credit_items where id = $1 for update", [itemId]))[0];
    if (!it) throw new FinanceError("Credit entry not found.");
    if (it.status !== "open") throw new FinanceError("This credit entry is already settled.");
    if (amount > it.amount - it.paid) throw new FinanceError(`Only Rs. ${(it.amount - it.paid).toLocaleString("en-PK")} is still outstanding.`);
    const party = it.direction === "receivable" ? { partyType: "customer", partyId: it.party_id } : { partyType: "supplier", partyId: it.party_id };
    const j = await post(q, {
      key: `credit-pay:${key}`, memo: it.direction === "receivable" ? "Customer credit repayment" : "Supplier payment", refType: "credit_item", refId: itemId, actor,
      lines: it.direction === "receivable"
        ? [{ account: accountCode, debit: amount }, { account: ACC.receivable, credit: amount, ...party }]
        : [{ account: ACC.payable, debit: amount, ...party }, { account: accountCode, credit: amount }],
    });
    await q.query("insert into credit_payments(item_id, amount, account_id, journal_id, idem_key, actor) values ($1,$2,(select id from fin_accounts where code = $3 or id::text = $3),$4,$5,$6)",
      [itemId, amount, accountCode, j?.id ?? null, key, actor]);
    const paid = it.paid + amount;
    await q.query("update credit_items set paid = $2, status = $3 where id = $1", [itemId, paid, paid >= it.amount ? "settled" : "open"]);
    if (it.source_type === "purchase" && it.source_id) await q.query("update purchases set paid_amount = paid_amount + $2 where id = $1", [it.source_id, amount]);
    await audit(actor, "credit_payment", "credit_item", itemId, { amount, direction: it.direction }, q);
  });
}

export interface AgingRow { partyId: string; name: string; kind: string; direction: string; current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number; total: number }

/** Outstanding by how overdue it is (days past the due date; no due date counts as current). */
export async function aging(q: Queryable, direction: "receivable" | "payable"): Promise<AgingRow[]> {
  const r = await q.query<{ party_id: string; name: string; kind: string; direction: string; cur: string; a: string; b: string; c: string; d: string }>(
    `select p.id as party_id, p.name, p.kind, i.direction,
       coalesce(sum(i.amount - i.paid) filter (where i.due_date is null or i.due_date >= (now() at time zone 'Asia/Karachi')::date),0) as cur,
       coalesce(sum(i.amount - i.paid) filter (where (now() at time zone 'Asia/Karachi')::date - i.due_date between 1 and 30),0) as a,
       coalesce(sum(i.amount - i.paid) filter (where (now() at time zone 'Asia/Karachi')::date - i.due_date between 31 and 60),0) as b,
       coalesce(sum(i.amount - i.paid) filter (where (now() at time zone 'Asia/Karachi')::date - i.due_date between 61 and 90),0) as c,
       coalesce(sum(i.amount - i.paid) filter (where (now() at time zone 'Asia/Karachi')::date - i.due_date > 90),0) as d
     from credit_items i join credit_parties p on p.id = i.party_id
     where i.status = 'open' and i.direction = $1 group by p.id, p.name, p.kind, i.direction order by p.name`, [direction]);
  return r.map((x) => {
    const [cur, a, b, c, d] = [x.cur, x.a, x.b, x.c, x.d].map(Number);
    return { partyId: x.party_id, name: x.name, kind: x.kind, direction: x.direction, current: cur, d1_30: a, d31_60: b, d61_90: c, d90plus: d, total: cur + a + b + c + d };
  });
}
