import { z } from "zod";
import type { Db, Queryable } from "@/lib/db";
import { audit } from "@/lib/audit";
import { FinanceError, accountId, atomic, post, reverse } from "./ledger";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const expenseSchema = z.object({
  date: day, category: z.string().min(1), payAccount: z.string().min(1), amount: z.number().int().positive("Enter the amount."),
  description: z.string().trim().max(300).default(""), receiptUrl: z.string().url().max(500).optional().nullable(),
  orderId: z.string().uuid().optional().nullable(), repairId: z.string().uuid().optional().nullable(),
});

async function isExpenseAccount(q: Queryable, id: string) {
  const r = await q.query<{ type: string }>("select type from fin_accounts where id = $1", [id]);
  if (r[0]?.type !== "expense") throw new FinanceError("Choose an expense category.");
}

export async function addExpense(db: Db, raw: unknown, actor: string, key: string): Promise<string> {
  const e = expenseSchema.parse(raw);
  return atomic(db, async (q) => {
    const cat = await accountId(q, e.category); await isExpenseAccount(q, cat);
    const pay = await accountId(q, e.payAccount);
    const dup = await q.query<{ id: string }>("select e.id from expenses e join fin_journals j on j.id = e.journal_id where j.idem_key = $1", [`expense:${key}`]);
    if (dup[0]) return dup[0].id;
    const j = await post(q, { key: `expense:${key}`, date: e.date, memo: e.description || "Expense", refType: "expense", actor, lines: [{ account: cat, debit: e.amount }, { account: pay, credit: e.amount }] });
    const id = (await q.query<{ id: string }>(
      "insert into expenses(expense_date, account_id, pay_account_id, amount, description, receipt_url, order_id, repair_id, journal_id, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
      [e.date, cat, pay, e.amount, e.description, e.receiptUrl ?? null, e.orderId ?? null, e.repairId ?? null, j?.id ?? null, actor]))[0].id;
    await audit(actor, "expense_added", "expense", id, { amount: e.amount, category: e.category }, q);
    return id;
  });
}

/** Cancel an expense with a reversing entry. The original stays visible in the ledger. */
export async function voidExpense(db: Db, id: string, actor: string, why: string): Promise<void> {
  await atomic(db, async (q) => {
    const e = (await q.query<{ journal_id: string | null; voided_at: string | null }>("select journal_id, voided_at from expenses where id = $1 for update", [id]))[0];
    if (!e) throw new FinanceError("Expense not found.");
    if (e.voided_at) return;
    if (e.journal_id) await reverse(q, e.journal_id, actor, why);
    await q.query("update expenses set voided_at = now() where id = $1", [id]);
    await audit(actor, "expense_voided", "expense", id, { why }, q);
  });
}

export async function saveTemplate(db: Db, raw: { name: string; category: string; payAccount: string; amount: number; dayOfMonth: number; description?: string }, actor: string): Promise<string> {
  const t = z.object({ name: z.string().trim().min(2).max(80), category: z.string(), payAccount: z.string(), amount: z.number().int().positive(), dayOfMonth: z.number().int().min(1).max(28), description: z.string().max(300).optional() }).parse(raw);
  return atomic(db, async (q) => {
    const cat = await accountId(q, t.category); await isExpenseAccount(q, cat);
    const id = (await q.query<{ id: string }>("insert into expense_templates(name, account_id, pay_account_id, amount, day_of_month, description) values ($1,$2,$3,$4,$5,$6) returning id",
      [t.name, cat, await accountId(q, t.payAccount), t.amount, t.dayOfMonth, t.description ?? ""]))[0].id;
    await audit(actor, "expense_template_saved", "expense_template", id, { name: t.name }, q);
    return id;
  });
}

/**
 * Post every active recurring expense for a month ('YYYY-MM') whose day has arrived. The same template can never post twice for
 * one month (unique index + idempotent key), so running this daily, twice a day, or by hand is safe.
 */
export async function runRecurring(db: Db, month: string, today: string, actor: string): Promise<number> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new FinanceError("Month must look like 2026-11.");
  const tpls = await db.query<{ id: string; name: string; account_id: string; pay_account_id: string; amount: number; day_of_month: number; description: string }>("select * from expense_templates where active");
  let made = 0;
  for (const t of tpls) {
    const date = `${month}-${String(t.day_of_month).padStart(2, "0")}`;
    if (date > today) continue;
    const done = await db.query("select 1 from expenses where template_id = $1 and period = $2 and voided_at is null", [t.id, month]);
    if (done[0]) continue;
    await atomic(db, async (q) => {
      const j = await post(q, { key: `expense:tpl:${t.id}:${month}`, date, memo: t.name, refType: "expense", actor, lines: [{ account: t.account_id, debit: t.amount }, { account: t.pay_account_id, credit: t.amount }] });
      await q.query("insert into expenses(expense_date, account_id, pay_account_id, amount, description, template_id, period, journal_id, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing",
        [date, t.account_id, t.pay_account_id, t.amount, t.description || t.name, t.id, month, j?.id ?? null, actor]);
    });
    made++;
  }
  return made;
}

export async function expensesByCategory(q: Queryable, from: string, to: string) {
  return q.query<{ code: string; name: string; total: string | number }>(
    `select a.code, a.name, coalesce(sum(e.debit - e.credit),0) as total from fin_accounts a
     left join (select e.* from fin_entries e join fin_journals j on j.id = e.journal_id where j.effective_date between $1::date and $2::date) e on e.account_id = a.id
     where a.kind = 'expense_cat' group by a.id order by a.code`, [from, to]);
}

/** Month-by-month totals per category for trend charts. */
export async function expenseTrend(q: Queryable, months: number) {
  return q.query<{ month: string; code: string; name: string; total: string | number }>(
    `select to_char(j.effective_date, 'YYYY-MM') as month, a.code, a.name, sum(e.debit - e.credit) as total
     from fin_entries e join fin_journals j on j.id = e.journal_id join fin_accounts a on a.id = e.account_id
     where a.kind = 'expense_cat' and j.effective_date >= (date_trunc('month', now() at time zone 'Asia/Karachi') - ($1::int - 1) * interval '1 month')::date
     group by 1, a.code, a.name order by 1, a.code`, [months]);
}
