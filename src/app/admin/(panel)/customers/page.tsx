import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { fmtDate, td, th } from "@/components/admin/ui";
import { formatPKR } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/** Guest orders and registered accounts, grouped by phone number. Managers and owners only. */
export default async function CustomersAdmin() {
  await requireAdmin("manager");
  const db = await getDb();
  const rows = await db.query<{ phone: string; name: string; orders: number; spent: number; last: string; email: string | null }>(
    `select phone, (array_agg(customer_name order by created_at desc))[1] as name, count(*)::int as orders,
       coalesce(sum(total) filter (where status not in ('cancelled','rejected','returned')), 0)::int as spent,
       max(created_at) as last, (array_agg(email order by created_at desc) filter (where email is not null))[1] as email
     from orders group by phone order by max(created_at) desc limit 300`);
  const accounts = (await db.query<{ n: number }>("select count(*)::int as n from customers"))[0]?.n ?? 0;
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Customers</h1>
      <p className="mt-1 text-sm text-muted">Grouped by phone number from orders. {accounts} registered account{accounts === 1 ? "" : "s"}. Handle this data privately and do not share it.</p>
      <div className="mt-4 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>Name</th><th className={th}>Phone</th><th className={th}>Email</th><th className={th}>Orders</th><th className={th}>Spent</th><th className={th}>Last order</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td className={td} colSpan={6}>No customers yet.</td></tr>}
            {rows.map((c) => <tr key={c.phone}><td className={td}>{c.name}</td><td className={td}>{c.phone}</td><td className={td}>{c.email ?? "—"}</td><td className={td}>{c.orders}</td><td className={td}>{formatPKR(c.spent)}</td><td className={td}>{fmtDate(c.last)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
