import type { Db, Queryable } from "@/lib/db";
import { audit } from "@/lib/audit";
import { FinanceError, accountId, atomic, post, reverse } from "./ledger";

export interface ClosingFigures { opening: number; received: number; paidOut: number; transfersNet: number; expected: number }

/** Figures for one day of one cash account, from the ledger. Transfers are shown on their own line, and a closing's own difference entry is left out so the figures never change after the fact. */
export async function computeClosing(q: Queryable, date: string, account = "1000"): Promise<ClosingFigures> {
  const id = await accountId(q, account);
  const r = (await q.query<{ opening: string | number; received: string | number; paid: string | number; tr: string | number }>(
    `select
       coalesce(sum(e.debit - e.credit) filter (where j.effective_date < $2::date), 0) as opening,
       coalesce(sum(e.debit)  filter (where j.effective_date = $2::date and coalesce(j.ref_type,'') not in ('transfer','closing')), 0) as received,
       coalesce(sum(e.credit) filter (where j.effective_date = $2::date and coalesce(j.ref_type,'') not in ('transfer','closing')), 0) as paid,
       coalesce(sum(e.debit - e.credit) filter (where j.effective_date = $2::date and j.ref_type = 'transfer'), 0) as tr
     from fin_entries e join fin_journals j on j.id = e.journal_id
     where e.account_id = $1 and j.effective_date <= $2::date`, [id, date]))[0];
  const f = { opening: Number(r.opening), received: Number(r.received), paidOut: Number(r.paid), transfersNet: Number(r.tr), expected: 0 };
  f.expected = f.opening + f.received - f.paidOut + f.transfersNet;
  return f;
}

/** Final cash count for a day. Any difference is posted openly to "Cash and balance differences". One final closing per day and account. */
export async function closeDay(db: Db, i: { date: string; counted: number; note?: string; account?: string }, actor: string): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) throw new FinanceError("Choose the day to close.");
  if (!Number.isSafeInteger(i.counted) || i.counted < 0) throw new FinanceError("Enter the cash you counted, in whole rupees.");
  const acct = i.account ?? "1000";
  return atomic(db, async (q) => {
    const aid = await accountId(q, acct);
    if ((await q.query("select 1 from daily_closings where close_date = $1 and account_id = $2 and status = 'final'", [i.date, aid]))[0])
      throw new FinanceError("This day is already closed. A correction needs the owner's approval.");
    const f = await computeClosing(q, i.date, acct);
    const diff = i.counted - f.expected;
    const id = (await q.query<{ id: string }>(
      `insert into daily_closings(close_date, account_id, opening, received, paid_out, transfers_net, expected, counted, difference, note, closed_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [i.date, aid, f.opening, f.received, f.paidOut, f.transfersNet, f.expected, i.counted, diff, i.note ?? null, actor]))[0].id;
    if (diff !== 0) await post(q, { key: `closing:${id}`, date: i.date, memo: `Daily closing difference ${i.date}`, refType: "closing", refId: id, actor, lines: diff > 0 ? [{ account: acct, debit: diff }, { account: "5200", credit: diff }] : [{ account: "5200", debit: -diff }, { account: acct, credit: -diff }] });
    await audit(actor, "day_closed", "daily_closing", id, { date: i.date, expected: f.expected, counted: i.counted, difference: diff }, q);
    return id;
  });
}

/** Correct a finalised closing. Owner only (the caller checks); the old closing is kept, marked superseded, and its difference entry is reversed. */
export async function correctClosing(db: Db, closingId: string, counted: number, reason: string, approver: string): Promise<string> {
  if (!reason.trim()) throw new FinanceError("Write the reason for the correction.");
  if (!Number.isSafeInteger(counted) || counted < 0) throw new FinanceError("Enter the cash you counted, in whole rupees.");
  return atomic(db, async (q) => {
    const old = (await q.query<{ id: string; close_date: string; account_id: string; opening: number; received: number; paid_out: number; transfers_net: number; expected: number; status: string }>(
      "select id, close_date::text, account_id, opening, received, paid_out, transfers_net, expected, status from daily_closings where id = $1 for update", [closingId]))[0];
    if (!old || old.status !== "final") throw new FinanceError("Only a final closing can be corrected.");
    const oldJ = await q.query<{ id: string }>("select id from fin_journals where idem_key = $1", [`closing:${old.id}`]);
    if (oldJ[0]) await reverse(q, oldJ[0].id, approver, `closing corrected: ${reason}`);
    await q.query("update daily_closings set status = 'superseded' where id = $1", [old.id]);
    const diff = counted - old.expected;
    const acct = (await q.query<{ code: string }>("select code from fin_accounts where id = $1", [old.account_id]))[0].code;
    const id = (await q.query<{ id: string }>(
      `insert into daily_closings(close_date, account_id, opening, received, paid_out, transfers_net, expected, counted, difference, status, supersedes_id, note, closed_by, approved_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'final',$10,$11,$12,$12) returning id`,
      [old.close_date, old.account_id, old.opening, old.received, old.paid_out, old.transfers_net, old.expected, counted, diff, old.id, `Correction: ${reason}`, approver]))[0].id;
    if (diff !== 0) await post(q, { key: `closing:${id}`, date: old.close_date, memo: `Daily closing difference ${old.close_date} (corrected)`, refType: "closing", refId: id, actor: approver, lines: diff > 0 ? [{ account: acct, debit: diff }, { account: "5200", credit: diff }] : [{ account: "5200", debit: -diff }, { account: acct, credit: -diff }] });
    await audit(approver, "closing_corrected", "daily_closing", id, { supersedes: old.id, counted, reason }, q);
    return id;
  });
}
