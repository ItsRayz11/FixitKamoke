import crypto from "node:crypto";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { accountMovements, monthRange } from "@/lib/finance/reports";
import { balances, moneyAccounts } from "@/lib/finance/ledger";
import { can, requireFinance } from "@/lib/finance/perms";
import { DateRange, PageHead, rs, selectCls, today } from "@/components/admin/finance-ui";
import { KeepForm } from "@/components/admin/keep-form";
import { Banner, Card, Field, inputCls, Submit, td, th } from "@/components/admin/ui";
import { createAccountAction, openingBalanceAction, ownerMovementAction, reconcileAction, transferAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Accounts({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; account?: string; from?: string; to?: string }> }) {
  const me = await requireFinance("finance_view");
  const sp = await searchParams;
  const db = await getDb();
  const [bal, accounts, month] = await Promise.all([balances(db), moneyAccounts(db), monthRange(db)]);
  const money = bal.filter((b) => ["cash", "bank", "wallet"].includes(b.kind));
  const write = can(me, "finance_write"); const owner = me.role === "owner";
  const from = sp.from ?? month.from; const to = sp.to ?? month.to;
  const moves = sp.account ? await accountMovements(db, sp.account, from, to) : [];
  const key = crypto.randomUUID();
  const hasOpening = new Set((await db.query<{ ref_id: string }>("select ref_id from fin_journals where idem_key like 'opening:%'")).map((r) => r.ref_id));
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
      <div>
        <PageHead title="Accounts" note="Every balance here is the sum of recorded movements. To change a balance, record what happened (a deposit, withdrawal, transfer or reconciliation); balances are never typed in." />
        <Banner ok={sp.ok} error={sp.error} />
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface"><table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>Account</th><th className={th}>Type</th><th className={th}>Balance</th><th className={th}></th></tr></thead>
          <tbody className="divide-y divide-line">
            {money.map((a) => (
              <tr key={a.id}><td className={`${td} font-semibold`}>{a.name}</td><td className={td}>{a.kind}</td><td className={`${td} font-semibold ${a.balance < 0 ? "text-danger" : ""}`}>{rs(a.balance)}</td>
                <td className={td}><Link className="underline" href={`/admin/finance/accounts?account=${a.code}`}>Movements</Link></td></tr>
            ))}
            <tr className="bg-canvas"><td className={`${td} font-bold`} colSpan={2}>Total</td><td className={`${td} font-bold`}>{rs(money.reduce((s, a) => s + a.balance, 0))}</td><td /></tr>
          </tbody></table></div>

        {sp.account && (
          <Card title={`Movements: ${money.find((m) => m.code === sp.account)?.name ?? sp.account}`} id="mv">
            <div className="mt-3"><DateRange from={from} to={to} extra={<input type="hidden" name="account" value={sp.account} />} /></div>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[30rem]"><thead className="border-b border-line"><tr><th className={th}>Date</th><th className={th}>What</th><th className={th}>In</th><th className={th}>Out</th></tr></thead>
              <tbody className="divide-y divide-line">{moves.length === 0 && <tr><td className={td} colSpan={4}>No movements in this range.</td></tr>}
                {moves.map((m, i) => <tr key={i}><td className={td}>{m.date}</td><td className={td}>{m.memo}</td><td className={td}>{m.debit ? rs(m.debit) : ""}</td><td className={td}>{m.credit ? rs(m.credit) : ""}</td></tr>)}</tbody></table></div>
          </Card>
        )}
      </div>
      <div className="space-y-6">
        {write && (
          <KeepForm action={transferAction} className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
            <h2 className="font-bold">Transfer between accounts</h2><input type="hidden" name="key" value={key} />
            <Field label="From" id="t-f"><select id="t-f" name="from" className={selectCls}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
            <Field label="To" id="t-t"><select id="t-t" name="to" defaultValue={accounts[1]?.code} className={selectCls}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
            <Field label="Amount (Rs.)" id="t-a"><input id="t-a" name="amount" inputMode="numeric" required className={inputCls} /></Field>
            <Field label="Note" id="t-n"><input id="t-n" name="note" className={inputCls} /></Field>
            <Submit>Transfer</Submit>
          </KeepForm>
        )}
        {owner && (
          <>
            <KeepForm action={openingBalanceAction} className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
              <h2 className="font-bold">Opening balance</h2>
              <p className="text-xs text-muted">Once per account: the amount it held when you started using this system. Accounts without one: {money.filter((m) => !hasOpening.has(m.id)).map((m) => m.name).join(", ") || "none"}.</p>
              <Field label="Account" id="o-a"><select id="o-a" name="account" className={selectCls}>{accounts.filter((a) => !hasOpening.has(a.id)).map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
              <Field label="Amount (Rs.)" id="o-m"><input id="o-m" name="amount" inputMode="numeric" required className={inputCls} /></Field>
              <Field label="As of" id="o-d"><input id="o-d" name="date" type="date" defaultValue={today()} className={inputCls} /></Field>
              <Submit>Save opening balance</Submit>
            </KeepForm>
            <KeepForm action={ownerMovementAction} className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
              <h2 className="font-bold">Owner puts in / takes out</h2><input type="hidden" name="key" value={`${key}-o`} />
              <Field label="Account" id="w-a"><select id="w-a" name="account" className={selectCls}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
              <Field label="Direction" id="w-d"><select id="w-d" name="direction" className={selectCls}><option value="in">Owner puts money in</option><option value="out">Owner takes money out</option></select></Field>
              <Field label="Amount (Rs.)" id="w-m"><input id="w-m" name="amount" inputMode="numeric" required className={inputCls} /></Field>
              <Field label="Note" id="w-n"><input id="w-n" name="note" className={inputCls} /></Field>
              <Submit>Record</Submit>
            </KeepForm>
            <KeepForm action={reconcileAction} className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
              <h2 className="font-bold">Reconcile with the real balance</h2><input type="hidden" name="key" value={`${key}-r`} />
              <p className="text-xs text-muted">Counted the drawer or checked the bank and it differs? Enter the real balance. The difference is recorded openly with your reason.</p>
              <Field label="Account" id="r-a"><select id="r-a" name="account" className={selectCls}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
              <Field label="Real balance (Rs.)" id="r-m"><input id="r-m" name="actual" inputMode="numeric" required className={inputCls} /></Field>
              <Field label="Reason" id="r-r"><input id="r-r" name="reason" required className={inputCls} /></Field>
              <Submit>Reconcile</Submit>
            </KeepForm>
            <KeepForm action={createAccountAction} className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
              <h2 className="font-bold">Add an account</h2>
              <Field label="Name" id="n-n"><input id="n-n" name="name" required placeholder="Meezan Bank" className={inputCls} /></Field>
              <Field label="Type" id="n-k"><select id="n-k" name="kind" className={selectCls}><option value="bank">Bank</option><option value="wallet">Wallet</option><option value="cash">Cash</option></select></Field>
              <Field label="Opening balance (Rs.)" id="n-o"><input id="n-o" name="opening" inputMode="numeric" className={inputCls} /></Field>
              <Submit>Add account</Submit>
            </KeepForm>
          </>
        )}
      </div>
    </div>
  );
}
