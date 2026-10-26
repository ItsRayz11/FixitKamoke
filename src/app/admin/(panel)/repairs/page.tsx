import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { Banner, fmtDate, td, th } from "@/components/admin/ui";
import { REPAIR_LABEL, REPAIR_STATUSES, type RepairStatus } from "@/lib/domain/repair-state";

export const dynamic = "force-dynamic";

export default async function RepairsAdmin({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; ok?: string; error?: string }> }) {
  await requireAdmin("staff");
  const sp = await searchParams;
  const status = (REPAIR_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "";
  const q = (sp.q ?? "").trim().slice(0, 60);
  const rows = await (await getDb()).query<{ id: string; reference: string; status: RepairStatus; customer_name: string; phone: string; device_brand: string; device_model: string; created_at: string }>(
    `select id, reference, status, customer_name, phone, device_brand, device_model, created_at from repair_inquiries
     where ($1 = '' or status = $1) and ($2 = '' or reference ilike '%' || $2 || '%' or phone like '%' || $2 || '%' or customer_name ilike '%' || $2 || '%' or device_model ilike '%' || $2 || '%')
     order by (status = 'new') desc, created_at desc limit 200`, [status, q]);
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Repair requests</h1>
      <form className="mt-4 flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="q">Search repairs</label>
        <input id="q" name="q" defaultValue={q} placeholder="Reference, name, phone or model" className="h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm sm:w-64" />
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={status} className="h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm sm:flex-none">
          <option value="">All statuses</option>
          {REPAIR_STATUSES.map((s) => <option key={s} value={s}>{REPAIR_LABEL[s]}</option>)}
        </select>
        <button className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-5 text-sm font-semibold text-white">Filter</button>
      </form>
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>Reference</th><th className={th}>Customer</th><th className={th}>Device</th><th className={th}>Status</th><th className={th}>Received</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td className={td} colSpan={5}>No repair requests found.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}><Link className="font-semibold text-accent" href={`/admin/repairs/${r.id}`}>{r.reference}</Link></td>
                <td className={td}>{r.customer_name}<br /><span className="text-xs text-muted">{r.phone}</span></td>
                <td className={td}>{r.device_brand} {r.device_model}</td>
                <td className={td}>{REPAIR_LABEL[r.status]}</td>
                <td className={td}>{fmtDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
