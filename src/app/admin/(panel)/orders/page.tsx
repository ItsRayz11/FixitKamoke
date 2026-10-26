import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { Banner, fmtDate, td, th } from "@/components/admin/ui";
import { formatPKR } from "@/lib/domain/money";
import { ORDER_STATUSES } from "@/lib/domain/order-state";
import { STATUS_LABEL } from "@/lib/orders/lookup";

export const dynamic = "force-dynamic";

export default async function OrdersAdmin({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; ok?: string; error?: string }> }) {
  await requireAdmin("staff");
  const sp = await searchParams;
  const status = (ORDER_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "";
  const q = (sp.q ?? "").trim().slice(0, 60);
  const rows = await (await getDb()).query<{ id: string; order_number: string; status: string; customer_name: string; phone: string; city: string; total: number; created_at: string; shipping_status: string; payment_method: string; payment_status: string }>(
    `select id, order_number, status, customer_name, phone, city, total, created_at, shipping_status, payment_method, payment_status from orders
     where ($1 = '' or status = $1) and ($2 = '' or order_number ilike '%' || $2 || '%' or phone like '%' || $2 || '%' or customer_name ilike '%' || $2 || '%')
     order by created_at desc limit 200`, [status, q]);
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Orders</h1>
      <form className="mt-4 flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="q">Search orders</label>
        <input id="q" name="q" defaultValue={q} placeholder="Order number, name or phone" className="h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm sm:w-64" />
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={status} className="h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm sm:flex-none">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-5 text-sm font-semibold text-white">Filter</button>
      </form>
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>Order</th><th className={th}>Customer</th><th className={th}>City</th><th className={th}>Total</th><th className={th}>Status</th><th className={th}>Placed</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td className={td} colSpan={6}>No orders found.</td></tr>}
            {rows.map((o) => (
              <tr key={o.id}>
                <td className={td}><Link className="font-semibold text-accent" href={`/admin/orders/${o.id}`}>{o.order_number}</Link></td>
                <td className={td}>{o.customer_name}<br /><span className="text-xs text-muted">{o.phone}</span></td>
                <td className={td}>{o.city}</td>
                <td className={td}>{formatPKR(o.total)}{o.shipping_status === "needs_confirmation" && <span className="block text-xs text-warn">delivery fee TBC</span>}
                  {o.payment_method !== "cod" && <span className={`block text-xs ${o.payment_status === "paid" ? "text-ok" : "text-warn"}`}>{o.payment_status === "paid" ? "paid" : o.payment_status === "pending" && o.payment_method === "bank_transfer" ? "payment to check" : "awaiting payment"}</span>}</td>
                <td className={td}>{STATUS_LABEL[o.status] ?? o.status}</td>
                <td className={td}>{fmtDate(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
