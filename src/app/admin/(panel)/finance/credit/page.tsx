import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { aging, type AgingRow } from "@/lib/finance/credit";
import { moneyAccounts } from "@/lib/finance/ledger";
import { can, requireFinance } from "@/lib/finance/perms";
import { PageHead, rs, selectCls } from "@/components/admin/finance-ui";
import { Banner, Card, inputCls, td, th } from "@/components/admin/ui";
import { creditLimitAction, creditPayAction } from "../actions";

function Aging({ rows, title }: { rows: AgingRow[]; title: string }) {
  return (
  <Card title={title} id={title}>
    <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[32rem]"><thead className="border-b border-line"><tr><th className={th}>Name</th><th className={th}>Not due</th><th className={th}>1–30 days</th><th className={th}>31–60</th><th className={th}>61–90</th><th className={th}>90+</th><th className={th}>Total</th></tr></thead>
      <tbody className="divide-y divide-line">{rows.length === 0 && <tr><td className={td} colSpan={7}>Nothing outstanding.</td></tr>}
        {rows.map((r) => <tr key={r.partyId}><td className={`${td} font-semibold`}>{r.name}</td><td className={td}>{rs(r.current)}</td><td className={td}>{rs(r.d1_30)}</td><td className={td}>{rs(r.d31_60)}</td><td className={td}>{rs(r.d61_90)}</td><td className={`${td} ${r.d90plus ? "text-danger" : ""}`}>{rs(r.d90plus)}</td><td className={`${td} font-bold`}>{rs(r.total)}</td></tr>)}
        {rows.length > 0 && <tr className="bg-canvas"><td className={`${td} font-bold`}>Total</td><td colSpan={5} /><td className={`${td} font-bold`}>{rs(rows.reduce((s, r) => s + r.total, 0))}</td></tr>}</tbody></table></div>
  </Card>
);
}

export const dynamic = "force-dynamic";

export default async function Credit({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireFinance("finance_view");
  const sp = await searchParams;
  const db = await getDb();
  const [recv, pay, accounts, items, parties] = await Promise.all([
    aging(db, "receivable"), aging(db, "payable"), moneyAccounts(db),
    db.query<{ id: string; party: string; direction: string; source_type: string; amount: number; paid: number; due_date: string | null; created_at: string }>(
      "select i.id, p.name as party, i.direction, i.source_type, i.amount, i.paid, i.due_date::text, i.created_at::text from credit_items i join credit_parties p on p.id = i.party_id where i.status = 'open' order by i.due_date nulls last, i.created_at"),
    db.query<{ id: string; name: string; kind: string; credit_limit: number | null }>("select id, name, kind, credit_limit from credit_parties where kind = 'customer' and active order by name"),
  ]);
  const write = can(me, "finance_write");
  const key = crypto.randomUUID();
  return (
    <div className="space-y-6">
      <PageHead title="Credit (udhaar)" note="Money customers owe you, and money you owe suppliers. A credit sale counts as a sale but adds no cash until it is paid." />
      <Banner ok={sp.ok} error={sp.error} />
      <Aging rows={recv} title="Customers owe you" />
      <Aging rows={pay} title="You owe suppliers" />
      <Card title="Open items and repayments" id="open">
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[40rem]"><thead className="border-b border-line"><tr><th className={th}>Who</th><th className={th}>Type</th><th className={th}>From</th><th className={th}>Due</th><th className={th}>Left</th><th className={th}>Record payment</th></tr></thead>
          <tbody className="divide-y divide-line">{items.length === 0 && <tr><td className={td} colSpan={6}>No open credit.</td></tr>}
            {items.map((i) => (
              <tr key={i.id}><td className={`${td} font-semibold`}>{i.party}</td><td className={td}>{i.direction === "receivable" ? "Owes you" : "You owe"}</td><td className={td}>{i.source_type.replace("_", " ")}</td><td className={td}>{i.due_date ?? "—"}</td><td className={`${td} font-semibold`}>{rs(i.amount - i.paid)}</td>
                <td className={td}>{(i.direction === "receivable" || write) && (
                  <form action={creditPayAction} className="flex gap-2"><input type="hidden" name="id" value={i.id} /><input type="hidden" name="key" value={`${key}-${i.id}-${i.paid}`} />
                    <input name="amount" inputMode="numeric" defaultValue={i.amount - i.paid} aria-label="Amount" className={`${inputCls} !mt-0 w-24`} />
                    <select name="account" aria-label={i.direction === "receivable" ? "Received into" : "Paid from"} className={`${selectCls} !mt-0 w-32`}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select>
                    <button className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-3 text-sm font-semibold text-white">{i.direction === "receivable" ? "Received" : "Paid"}</button></form>)}</td></tr>
            ))}</tbody></table></div>
      </Card>
      {write && (
        <Card title="Credit limits" id="lim">
          <p className="mt-1 text-xs text-muted">A customer over their limit cannot be given more credit unless the owner approves it at the counter. Empty means no limit.</p>
          <ul className="mt-2 divide-y divide-line">{parties.length === 0 && <li className="py-2 text-sm text-muted">No credit customers yet.</li>}
            {parties.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="font-semibold">{p.name}</span>
              <form action={creditLimitAction} className="flex gap-2"><input type="hidden" name="id" value={p.id} /><input name="limit" inputMode="numeric" defaultValue={p.credit_limit ?? ""} placeholder="No limit" aria-label={`Credit limit for ${p.name}`} className={`${inputCls} !mt-0 w-32`} /><button className="min-h-11 text-sm font-semibold underline">Save</button></form></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
