import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { AccountNav } from "@/components/account/account-nav";
import { formatPKR } from "@/lib/domain/money";
import { STATUS_LABEL } from "@/lib/orders/lookup";
import { fmtDate } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const me = await requireCustomer();
  // Only orders placed while signed in to this account. Guest orders are never matched by phone or email, so nobody can read someone else's.
  const orders = await (await getDb()).query<{ order_number: string; status: string; total: number; created_at: string; items: number }>(
    `select o.order_number, o.status, o.total, o.created_at, (select coalesce(sum(quantity),0)::int from order_items i where i.order_id = o.id) as items
     from orders o where o.customer_id = $1 order by o.created_at desc limit 100`, [me.id]);
  return (
    <>
      <AccountNav name={me.name} current="/account" />
      <h1 className="text-2xl font-extrabold">Your orders</h1>
      {orders.length === 0 ? (
        <p className="mt-4 rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-8 text-center text-muted">No orders on this account yet. Orders placed while signed in appear here. <Link href="/shop" className="font-semibold text-accent underline">Start shopping</Link></p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
          {orders.map((o) => (
            <li key={o.order_number} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div><p className="font-bold">{o.order_number}</p><p className="text-muted">{fmtDate(o.created_at)} · {o.items} item{o.items === 1 ? "" : "s"}</p></div>
              <div className="text-right"><p className="font-bold">{formatPKR(o.total)}</p><p className="text-accent">{STATUS_LABEL[o.status] ?? o.status}</p></div>
              <Link href="/track" className="w-full text-xs font-semibold text-accent underline sm:w-auto">Track with your order number</Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
