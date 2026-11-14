import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { moneyAccounts } from "@/lib/finance/ledger";
import { requireFinance } from "@/lib/finance/perms";
import { PageHead, rs, selectCls, today } from "@/components/admin/finance-ui";
import { KeepForm } from "@/components/admin/keep-form";
import { Banner, Card, Field, inputCls, Submit, td, th } from "@/components/admin/ui";
import { cancelPurchaseAction, createPurchaseAction, payPurchaseAction, receivePurchaseAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Purchases({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireFinance("finance_write");
  const sp = await searchParams;
  const db = await getDb();
  const [rows, suppliers, products, accounts] = await Promise.all([
    db.query<{ id: string; invoice_no: string | null; purchase_date: string; status: string; total_cost: number; paid_amount: number; supplier: string | null; units: number }>(
      `select p.id, p.invoice_no, p.purchase_date::text, p.status, p.total_cost, p.paid_amount, s.name as supplier,
         coalesce((select sum(units_received) from purchase_items i where i.purchase_id = p.id),0)::int as units
       from purchases p left join suppliers s on s.id = p.supplier_id order by p.purchase_date desc, p.created_at desc limit 60`),
    db.query<{ id: string; name: string }>("select id, name from suppliers where active order by name"),
    db.query<{ id: string; name: string; sku: string | null; variant_label: string | null }>("select id, name, sku, variant_label from products order by name limit 800"),
    moneyAccounts(db),
  ]);
  const key = crypto.randomUUID();
  const opt = products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.variant_label ? ` (${p.variant_label})` : ""}{p.sku ? ` · ${p.sku}` : ""}</option>);
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_420px]">
      <div>
        <PageHead title="Purchases" note="Stock goes up when you receive a purchase, not when you save it. Cost per unit is worked out for you, including transport and discount." />
        <Banner ok={sp.ok} error={sp.error} />
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
          <table className="w-full min-w-[40rem]">
            <thead className="border-b border-line"><tr><th className={th}>Date</th><th className={th}>Supplier</th><th className={th}>Invoice</th><th className={th}>Units</th><th className={th}>Total</th><th className={th}>Still owed</th><th className={th}>Action</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 && <tr><td className={td} colSpan={7}>No purchases yet.</td></tr>}
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className={td}>{p.purchase_date}{p.status !== "received" && <span className="ml-2 text-xs text-muted">({p.status})</span>}</td>
                  <td className={td}>{p.supplier ?? "—"}</td><td className={td}>{p.invoice_no ?? "—"}</td><td className={td}>{p.units}</td>
                  <td className={`${td} font-semibold`}>{rs(p.total_cost)}</td>
                  <td className={td}>{p.status === "received" ? (p.total_cost - p.paid_amount > 0 ? <span className="font-semibold text-warn">{rs(p.total_cost - p.paid_amount)}</span> : "Paid") : "—"}</td>
                  <td className={td}>
                    {p.status === "draft" && (
                      <div className="flex gap-3">
                        <form action={receivePurchaseAction}><input type="hidden" name="id" value={p.id} /><button className="min-h-11 text-sm font-semibold underline">Receive</button></form>
                        <form action={cancelPurchaseAction}><input type="hidden" name="id" value={p.id} /><button className="min-h-11 text-sm underline">Cancel</button></form>
                      </div>
                    )}
                    {p.status === "received" && p.total_cost - p.paid_amount > 0 && (
                      <form action={payPurchaseAction} className="flex gap-2"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="key" value={`${p.id}-${p.paid_amount}`} />
                        <input name="amount" inputMode="numeric" defaultValue={p.total_cost - p.paid_amount} aria-label="Amount to pay" className={`${inputCls} !mt-0 w-24`} />
                        <select name="account" aria-label="Pay from" className={`${selectCls} !mt-0 w-32`}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select>
                        <button className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-3 text-sm font-semibold text-white">Pay</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <KeepForm action={createPurchaseAction} className="h-fit space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <h2 className="font-bold">New purchase</h2>
        <input type="hidden" name="key" value={key} />
        <Field label="Supplier" id="p-sup"><select id="p-sup" name="supplier" className={selectCls}><option value="">No supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" id="p-date"><input id="p-date" name="date" type="date" defaultValue={today()} className={inputCls} /></Field>
          <Field label="Invoice no." id="p-inv"><input id="p-inv" name="invoice" className={inputCls} /></Field>
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <fieldset key={i} className="rounded-[var(--radius-sm)] border border-line p-2">
            <legend className="px-1 text-xs font-semibold text-muted">Item {i + 1}</legend>
            <select name={`p${i}`} aria-label={`Product ${i + 1}`} className={selectCls}><option value="">Choose product</option>{opt}</select>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <select name={`t${i}`} aria-label="Bought by" className={selectCls}><option value="unit">Unit</option><option value="box">Box</option></select>
              <input name={`q${i}`} inputMode="numeric" placeholder="Qty" aria-label="Quantity" className={inputCls} />
              <input name={`u${i}`} inputMode="numeric" placeholder="Per box" aria-label="Units per box" className={inputCls} />
              <input name={`c${i}`} inputMode="decimal" placeholder="Cost each" aria-label="Cost per unit or per box" className={inputCls} />
            </div>
          </fieldset>
        ))}
        <p className="text-xs text-muted">Cost is per unit, or per box when “Box” is chosen. Units per box is only used for boxes.</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Discount" id="p-disc"><input id="p-disc" name="discount" inputMode="numeric" className={inputCls} /></Field>
          <Field label="Transport" id="p-tr"><input id="p-tr" name="transport" inputMode="numeric" className={inputCls} /></Field>
          <Field label="Other cost" id="p-ot"><input id="p-ot" name="other" inputMode="numeric" className={inputCls} /></Field>
        </div>
        <Field label="Payment due date" id="p-due" hint="Optional, for what you will still owe."><input id="p-due" name="due" type="date" className={inputCls} /></Field>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="receiveNow" className="h-5 w-5" /> Goods arrived: receive now</label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid now" id="p-pay" hint="Only when receiving."><input id="p-pay" name="payNow" inputMode="numeric" className={inputCls} /></Field>
          <Field label="Paid from" id="p-acc"><select id="p-acc" name="payAccount" className={selectCls}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
        </div>
        <Submit>Save purchase</Submit>
      </KeepForm>
      <Card><p className="text-xs text-muted">A received purchase cannot be edited. To correct a mistake, record a stock adjustment or contact the owner.</p></Card>
    </div>
  );
}
