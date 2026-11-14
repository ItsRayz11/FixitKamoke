import { getDb } from "@/lib/db";
import { requireFinance } from "@/lib/finance/perms";
import { PageHead, rs } from "@/components/admin/finance-ui";
import { KeepForm } from "@/components/admin/keep-form";
import { Banner, Field, inputCls, Submit, td, th } from "@/components/admin/ui";
import { saveSupplierAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Suppliers({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireFinance("finance_write");
  const sp = await searchParams;
  const rows = await (await getDb()).query<{ id: string; name: string; phone: string | null; email: string | null; purchases: number; total: number; owed: number; last: string | null }>(
    `select s.id, s.name, s.phone, s.email, count(p.id) filter (where p.status = 'received')::int as purchases,
       coalesce(sum(p.total_cost) filter (where p.status = 'received'),0)::int as total,
       coalesce(sum(p.total_cost - p.paid_amount) filter (where p.status = 'received'),0)::int as owed, max(p.purchase_date)::text as last
     from suppliers s left join purchases p on p.supplier_id = s.id where s.active group by s.id order by s.name`);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <PageHead title="Suppliers" note="Who you buy from, how much you have bought, and what you still owe them." />
        <Banner ok={sp.ok} error={sp.error} />
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
          <table className="w-full min-w-[34rem]">
            <thead className="border-b border-line"><tr><th className={th}>Supplier</th><th className={th}>Contact</th><th className={th}>Purchases</th><th className={th}>Total bought</th><th className={th}>Still owed</th><th className={th}>Last</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 && <tr><td className={td} colSpan={6}>No suppliers yet.</td></tr>}
              {rows.map((s) => (
                <tr key={s.id}><td className={`${td} font-semibold`}>{s.name}</td><td className={td}>{s.phone ?? s.email ?? "—"}</td><td className={td}>{s.purchases}</td><td className={td}>{rs(s.total)}</td>
                  <td className={`${td} ${s.owed > 0 ? "font-semibold text-warn" : ""}`}>{rs(s.owed)}</td><td className={td}>{s.last ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <KeepForm action={saveSupplierAction} className="h-fit space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <h2 className="font-bold">Add supplier</h2>
        <Field label="Name" id="s-name"><input id="s-name" name="name" required className={inputCls} /></Field>
        <Field label="Phone" id="s-phone"><input id="s-phone" name="phone" className={inputCls} /></Field>
        <Field label="Email" id="s-email"><input id="s-email" name="email" type="email" className={inputCls} /></Field>
        <Field label="Address" id="s-addr"><input id="s-addr" name="address" className={inputCls} /></Field>
        <Field label="Notes" id="s-notes"><input id="s-notes" name="notes" className={inputCls} /></Field>
        <Submit>Save supplier</Submit>
      </KeepForm>
    </div>
  );
}
