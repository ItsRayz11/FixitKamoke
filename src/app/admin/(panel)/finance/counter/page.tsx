import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { moneyAccounts } from "@/lib/finance/ledger";
import { can, requireFinance } from "@/lib/finance/perms";
import { SERVICE_LABEL } from "@/lib/finance/services";
import { PageHead, rs, selectCls } from "@/components/admin/finance-ui";
import { KeepForm } from "@/components/admin/keep-form";
import { Banner, Field, fmtDate, inputCls, Submit, td, th } from "@/components/admin/ui";
import { counterSaleAction, serviceAction, voidSaleAction, voidServiceAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Counter({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireFinance("pos");
  const sp = await searchParams;
  const db = await getDb();
  const priced = can(me, "finance_write");
  const [products, accounts, sales, services] = await Promise.all([
    db.query<{ id: string; name: string; variant_label: string | null; price: number; stock: number }>("select id, name, variant_label, price, stock from products where stock > 0 order by name limit 800"),
    moneyAccounts(db),
    db.query<{ id: string; receipt_no: string; sold_at: string; total: number; paid_amount: number; status: string; customer_name: string | null }>("select id, receipt_no, sold_at, total, paid_amount, status, customer_name from pos_sales order by sold_at desc limit 12"),
    db.query<{ id: string; occurred_on: string; kind: string; principal: number; fee_amount: number; voided_at: string | null }>("select id, occurred_on::text, kind, principal, fee_amount, voided_at from service_entries order by created_at desc limit 12"),
  ]);
  const wallets = accounts.filter((a) => a.kind === "wallet");
  const k1 = crypto.randomUUID(); const k2 = crypto.randomUUID();
  return (
    <div>
      <PageHead title="Shop counter" note="Sell to walk-in customers from the same products and stock as the website, and record wallet and other services. Stock and money update automatically." />
      <Banner ok={sp.ok} error={sp.error} />
      <div className="grid gap-6 xl:grid-cols-2">
        <KeepForm action={counterSaleAction} className="h-fit space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <h2 className="font-bold">Counter sale</h2>
          <input type="hidden" name="key" value={k1} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`grid gap-2 ${priced ? "grid-cols-[1fr_70px_90px]" : "grid-cols-[1fr_70px]"}`}>
              <select name={`p${i}`} aria-label={`Product ${i + 1}`} className={selectCls}><option value="">{i === 0 ? "Choose product" : "—"}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.variant_label ? ` (${p.variant_label})` : ""} · {rs(p.price)} · {p.stock} left</option>)}</select>
              <input name={`q${i}`} inputMode="numeric" placeholder="Qty" aria-label="Quantity" className={inputCls} />
              {priced && <input name={`pr${i}`} inputMode="numeric" placeholder="Price" aria-label="Price override" className={inputCls} />}
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            {priced && <Field label="Discount (Rs.)" id="c-disc"><input id="c-disc" name="discount" inputMode="numeric" className={inputCls} /></Field>}
            <Field label="Received now (Rs.)" id="c-paid" hint="Leave empty if paid in full. Less than the total is credit."><input id="c-paid" name="paid" inputMode="numeric" className={inputCls} /></Field>
          </div>
          <Field label="Paid into" id="c-acc"><select id="c-acc" name="account" className={selectCls}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer name" id="c-name" hint="Needed for credit."><input id="c-name" name="name" className={inputCls} /></Field>
            <Field label="Customer phone" id="c-phone"><input id="c-phone" name="phone" className={inputCls} /></Field>
          </div>
          <Field label="Credit due date" id="c-due" hint="Only for credit."><input id="c-due" name="due" type="date" className={inputCls} /></Field>
          {me.role === "owner" && <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="over" className="h-5 w-5" /> Approve even if over the customer&apos;s credit limit</label>}
          <Submit>Complete sale</Submit>
        </KeepForm>

        <KeepForm action={serviceAction} className="h-fit space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <h2 className="font-bold">Wallet, recharge and other income</h2>
          <input type="hidden" name="key" value={k2} />
          <Field label="What happened" id="s-kind"><select id="s-kind" name="kind" className={selectCls}>{Object.entries(SERVICE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Amount moved (Rs.)" id="s-pr" hint="The money that goes to or from the customer. It is never counted as your income."><input id="s-pr" name="principal" inputMode="numeric" className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Your fee" id="s-fee"><input id="s-fee" name="fee" inputMode="decimal" className={inputCls} /></Field>
            <Field label="Fee type" id="s-fm"><select id="s-fm" name="feeMode" className={selectCls}><option value="fixed">Fixed Rs.</option><option value="percent">Percent %</option></select></Field>
          </div>
          <Field label="Wallet it moves through" id="s-w" hint="JazzCash, Easypaisa or a load balance. Not needed for plain income."><select id="s-w" name="wallet" className={selectCls}><option value="">None</option>{wallets.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
          <Field label="Cash goes to / comes from" id="s-c"><select id="s-c" name="cash" className={selectCls}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer name" id="s-n"><input id="s-n" name="name" className={inputCls} /></Field>
            <Field label="Note" id="s-note"><input id="s-note" name="note" className={inputCls} /></Field>
          </div>
          <Submit>Save entry</Submit>
        </KeepForm>
      </div>

      <h2 className="mt-8 font-bold">Recent counter sales</h2>
      <div className="mt-2 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface"><table className="w-full min-w-[32rem]">
        <thead className="border-b border-line"><tr><th className={th}>Receipt</th><th className={th}>When</th><th className={th}>Customer</th><th className={th}>Total</th><th className={th}>Paid</th><th className={th}></th></tr></thead>
        <tbody className="divide-y divide-line">
          {sales.length === 0 && <tr><td className={td} colSpan={6}>No counter sales yet.</td></tr>}
          {sales.map((s) => (
            <tr key={s.id}><td className={`${td} font-mono`}>{s.receipt_no}{s.status === "voided" && <span className="ml-2 text-xs text-danger">voided</span>}</td><td className={td}>{fmtDate(s.sold_at)}</td><td className={td}>{s.customer_name ?? "—"}</td><td className={td}>{rs(s.total)}</td><td className={td}>{rs(s.paid_amount)}</td>
              <td className={td}>{priced && s.status === "completed" && <form action={voidSaleAction} className="flex gap-2"><input type="hidden" name="id" value={s.id} /><input name="why" placeholder="Reason" aria-label="Reason" className={`${inputCls} !mt-0 w-28`} /><button className="min-h-11 text-sm underline">Void</button></form>}</td></tr>
          ))}
        </tbody></table></div>

      <h2 className="mt-8 font-bold">Recent wallet and service entries</h2>
      <div className="mt-2 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface"><table className="w-full min-w-[32rem]">
        <thead className="border-b border-line"><tr><th className={th}>Date</th><th className={th}>Type</th><th className={th}>Amount moved</th><th className={th}>Your fee</th><th className={th}></th></tr></thead>
        <tbody className="divide-y divide-line">
          {services.length === 0 && <tr><td className={td} colSpan={5}>None yet.</td></tr>}
          {services.map((s) => (
            <tr key={s.id} className={s.voided_at ? "opacity-50" : ""}><td className={td}>{s.occurred_on}</td><td className={td}>{SERVICE_LABEL[s.kind as keyof typeof SERVICE_LABEL]?.split(" (")[0] ?? s.kind}</td><td className={td}>{rs(s.principal)}</td><td className={td}>{rs(s.fee_amount)}</td>
              <td className={td}>{priced && !s.voided_at && <form action={voidServiceAction} className="flex gap-2"><input type="hidden" name="id" value={s.id} /><input name="why" placeholder="Reason" aria-label="Reason" className={`${inputCls} !mt-0 w-28`} /><button className="min-h-11 text-sm underline">Void</button></form>}</td></tr>
          ))}
        </tbody></table></div>
    </div>
  );
}
