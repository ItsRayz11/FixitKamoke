import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/admin/stats";
import { formatPKR } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v === null ? "Not enough data" : `${(v * 100).toFixed(1)}%`);
const rate = (a?: number, b?: number) => (b ? `${(((a ?? 0) / b) * 100).toFixed(1)}%` : "Not enough data");

function Stat({ label, value, href, note }: { label: string; value: string | number; href?: string; note?: string }) {
  const inner = (
    <div className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireAdmin("staff");
  const sp = await searchParams;
  const s = await getDashboardStats();
  const f = s.funnel;
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Dashboard</h1>
      {sp.denied && <p role="alert" className="mt-3 rounded-[var(--radius-sm)] bg-amber-50 p-3 text-sm text-warn">Your role does not have access to that page.</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders awaiting confirmation" value={s.pendingOrders} href="/admin/orders?status=pending_confirmation" />
        <Stat label="New repair requests" value={s.newRepairs} href="/admin/repairs?status=new" />
        <Stat label="Unanswered messages" value={s.openMessages} href="/admin/messages" />
        <Stat label="Orders, last 30 days" value={s.orders30} />
        <Stat label="Order value, last 30 days" value={formatPKR(s.revenue30)} note="Excludes cancelled, rejected and returned" />
        <Stat label="Average order value" value={s.aov30 ? formatPKR(s.aov30) : "—"} />
        <Stat label="Cancellation rate (30 days)" value={pct(s.cancelRate)} />
        <Stat label="Repeat customers" value={pct(s.repeatRate)} note="Share of phone numbers with 2+ orders" />
        <Stat label="Emails waiting to send" value={s.outboxPending} href="/admin/email" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4" aria-labelledby="low">
          <h2 id="low" className="font-bold">Low or no stock</h2>
          {s.lowStock.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing is running low.</p> : (
            <ul className="mt-2 divide-y divide-line text-sm">
              {s.lowStock.map((p) => <li key={p.id} className="flex justify-between py-2"><Link className="hover:text-accent" href={`/admin/products/${p.id}`}>{p.name}</Link><span className={p.stock === 0 ? "font-semibold text-danger" : "text-warn"}>{p.stock} left</span></li>)}
            </ul>
          )}
        </section>
        <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4" aria-labelledby="funnel">
          <h2 id="funnel" className="font-bold">Shopping funnel (30 days)</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Product views</dt><dd>{f.product_view ?? 0}</dd></div>
            <div className="flex justify-between"><dt>Added to cart</dt><dd>{f.add_to_cart ?? 0} <span className="text-muted">({rate(f.add_to_cart, f.product_view)} of views)</span></dd></div>
            <div className="flex justify-between"><dt>Started checkout</dt><dd>{f.checkout_start ?? 0} <span className="text-muted">({rate(f.checkout_start, f.add_to_cart)} of carts)</span></dd></div>
            <div className="flex justify-between"><dt>Orders placed</dt><dd>{f.order_placed ?? 0} <span className="text-muted">({rate(f.order_placed, f.checkout_start)} of checkouts)</span></dd></div>
            <div className="flex justify-between"><dt>Repair requests</dt><dd>{f.repair_submitted ?? 0}</dd></div>
            <div className="flex justify-between"><dt>Email sign-ups</dt><dd>{f.newsletter_signup ?? 0}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted">Counts only. No personal data is stored in these events.</p>
        </section>
      </div>
    </div>
  );
}
