import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { expenseTrend, expensesByCategory } from "@/lib/finance/expenses";
import { moneyAccounts } from "@/lib/finance/ledger";
import { monthRange } from "@/lib/finance/reports";
import { requireFinance } from "@/lib/finance/perms";
import { Bars, PageHead, rs, selectCls, today } from "@/components/admin/finance-ui";
import { KeepForm } from "@/components/admin/keep-form";
import { Banner, Card, Field, inputCls, Submit, td, th } from "@/components/admin/ui";
import { addExpenseAction, runRecurringAction, saveTemplateAction, voidExpenseAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Expenses({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireFinance("finance_write");
  const sp = await searchParams;
  const db = await getDb();
  const month = await monthRange(db);
  const [cats, accounts, byCat, trend, rows, tpls] = await Promise.all([
    db.query<{ code: string; name: string }>("select code, name from fin_accounts where kind = 'expense_cat' and active order by code"),
    moneyAccounts(db), expensesByCategory(db, month.from, month.to), expenseTrend(db, 6),
    db.query<{ id: string; expense_date: string; amount: number; description: string; category: string; account: string; receipt_url: string | null; voided_at: string | null }>(
      "select e.id, e.expense_date::text, e.amount, e.description, c.name as category, a.name as account, e.receipt_url, e.voided_at from expenses e join fin_accounts c on c.id = e.account_id join fin_accounts a on a.id = e.pay_account_id order by e.expense_date desc, e.created_at desc limit 40"),
    db.query<{ id: string; name: string; amount: number; day_of_month: number; category: string }>("select t.id, t.name, t.amount, t.day_of_month, c.name as category from expense_templates t join fin_accounts c on c.id = t.account_id where t.active order by t.name"),
  ]);
  const months = [...new Set(trend.map((t) => t.month))];
  const key = crypto.randomUUID();
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
      <div>
        <PageHead title="Expenses" note="Rent, bills, salaries and other running costs. Each one comes out of an account you choose." />
        <Banner ok={sp.ok} error={sp.error} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="This month by category" id="bycat">
            <ul className="mt-2 divide-y divide-line text-sm">{byCat.filter((c) => Number(c.total) !== 0).map((c) => <li key={c.code} className="flex justify-between py-2"><span>{c.name}</span><span className="font-semibold">{rs(Number(c.total))}</span></li>)}
              {byCat.every((c) => Number(c.total) === 0) && <li className="py-2 text-muted">Nothing yet this month.</li>}</ul>
          </Card>
          <Card title="Last 6 months" id="trend"><div className="mt-2"><Bars label="Total expenses per month" data={months.map((m) => ({ label: `${m}-01`, value: trend.filter((t) => t.month === m).reduce((s, t) => s + Number(t.total), 0) }))} /></div></Card>
        </div>
        <div className="mt-4 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
          <table className="w-full min-w-[36rem]">
            <thead className="border-b border-line"><tr><th className={th}>Date</th><th className={th}>Category</th><th className={th}>Details</th><th className={th}>Paid from</th><th className={th}>Amount</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 && <tr><td className={td} colSpan={6}>No expenses yet.</td></tr>}
              {rows.map((e) => (
                <tr key={e.id} className={e.voided_at ? "opacity-50 line-through" : ""}>
                  <td className={td}>{e.expense_date}</td><td className={td}>{e.category}</td>
                  <td className={td}>{e.description || "—"}{e.receipt_url && <> · <a className="underline" href={e.receipt_url} target="_blank" rel="noopener noreferrer">receipt</a></>}</td>
                  <td className={td}>{e.account}</td><td className={`${td} font-semibold`}>{rs(e.amount)}</td>
                  <td className={td}>{!e.voided_at && <form action={voidExpenseAction} className="flex gap-2"><input type="hidden" name="id" value={e.id} /><input name="why" placeholder="Reason" aria-label="Reason to cancel" className={`${inputCls} !mt-0 w-24`} /><button className="min-h-11 text-sm underline">Cancel</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-6">
        <KeepForm action={addExpenseAction} className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <h2 className="font-bold">Add expense</h2>
          <input type="hidden" name="key" value={key} />
          <Field label="Date" id="x-date"><input id="x-date" name="date" type="date" defaultValue={today()} className={inputCls} /></Field>
          <Field label="Category" id="x-cat"><select id="x-cat" name="category" className={selectCls}>{cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
          <Field label="Amount (Rs.)" id="x-amt"><input id="x-amt" name="amount" inputMode="numeric" required className={inputCls} /></Field>
          <Field label="Paid from" id="x-acc"><select id="x-acc" name="account" className={selectCls}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
          <Field label="Details" id="x-d"><input id="x-d" name="description" className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order no." id="x-o" hint="Optional, e.g. a courier charge."><input id="x-o" name="order" placeholder="FX-…" className={inputCls} /></Field>
            <Field label="Repair ref." id="x-rp" hint="Optional."><input id="x-rp" name="repair" className={inputCls} /></Field>
          </div>
          <Field label="Receipt link" id="x-r" hint="Optional. Paste a link to a photo of the receipt."><input id="x-r" name="receipt" type="url" className={inputCls} /></Field>
          <Submit>Save expense</Submit>
        </KeepForm>
        <KeepForm action={saveTemplateAction} className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <h2 className="font-bold">Recurring expense</h2>
          <Field label="Name" id="t-n"><input id="t-n" name="name" placeholder="Shop rent" required className={inputCls} /></Field>
          <Field label="Category" id="t-c"><select id="t-c" name="category" className={selectCls}>{cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" id="t-a"><input id="t-a" name="amount" inputMode="numeric" required className={inputCls} /></Field>
            <Field label="Day of month" id="t-d"><input id="t-d" name="day" inputMode="numeric" defaultValue={1} className={inputCls} /></Field>
          </div>
          <Field label="Paid from" id="t-p"><select id="t-p" name="account" className={selectCls}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
          <Submit>Save recurring</Submit>
          {tpls.length > 0 && <ul className="text-sm text-muted">{tpls.map((t) => <li key={t.id}>{t.name}: {rs(t.amount)} on day {t.day_of_month} ({t.category})</li>)}</ul>}
        </KeepForm>
        <form action={runRecurringAction}><button className="min-h-11 rounded-[var(--radius-sm)] border border-line px-4 text-sm font-semibold">Post this month&apos;s recurring expenses</button><p className="mt-1 text-xs text-muted">Each recurring expense posts once per month, no matter how often you press this.</p></form>
      </div>
    </div>
  );
}
