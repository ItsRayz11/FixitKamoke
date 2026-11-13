import Link from "next/link";
import { hasRole, requireAdmin } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/admin/stats";
import { formatPKR } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v === null ? "Not enough data" : `${(v * 100).toFixed(1)}%`);
const rate = (a?: number, b?: number) => (b ? `${(((a ?? 0) / b) * 100).toFixed(1)}%` : "Not enough data");

function Stat({ label, value, href, note }: { label: string; value: string | number; href?: string; note?: string }) {
  const inner = (
    <div className="h-full rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-extrabold ${typeof value === "string" && value.length > 10 && !value.startsWith("Rs") ? "text-base text-muted" : "text-2xl"}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full transition-transform active:scale-[0.98] hover:opacity-90">{inner}</Link> : inner;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const admin = await requireAdmin("staff");
  const manager = hasRole(admin, "manager");
  const owner = hasRole(admin, "owner");
  const sp = await searchParams;
  const s = await getDashboardStats();
  const f = s.funnel;
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Dashboard</h1>
      {sp.denied && <p role="alert" className="mt-3 rounded-[var(--radius-sm)] bg-amber-50 p-3 text-sm text-warn">Your role does not have access to that page.</p>}
      <nav aria-label="Quick actions" className="mt-4 flex flex-wrap gap-2">
        {([["/admin/products/new", "Add product", manager], ["/admin/orders?status=pending_confirmation", "View pending orders", true], ["/admin/coupons", "Create discount", manager], ["/admin/shipping", "Update shipping", manager], ["/admin/payments", "Review payments", owner]] as const).filter(([, , show]) => show).map(([href, label]) => (
          <Link key={href} href={href} className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-accent transition-colors hover:bg-canvas">{label}</Link>
        ))}
      </nav>

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-muted">Needs attention</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpis">
        <Stat label="Today's orders" value={s.todayOrders} href="/admin/orders" />
        <Stat label="Pending orders" value={s.pendingOrders} href="/admin/orders?status=pending_confirmation" note="Waiting for you to confirm" />
        <Stat label="Awaiting advance" value={s.awaitingAdvance} href="/admin/orders" note="COD advances not verified" />
        <Stat label="Awaiting payment" value={s.awaitingPayment} href={owner ? "/admin/payments" : "/admin/orders"} note="Transfers and online orders" />
        <Stat label="Ready to ship" value={s.readyToShip} href="/admin/orders" note="Confirmed or being prepared" />
        <Stat label="Low stock items" value={s.lowStock.length} href={manager ? "/admin/inventory" : undefined} note="3 or fewer left" />
        <Stat label="Pending repairs" value={s.newRepairs} href="/admin/repairs?status=new" />
        <Stat label="Unread messages" value={s.openMessages} href="/admin/messages" />
      </div>

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-muted">Last 30 days</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders" value={s.orders30} />
        <Stat label="Total sales" value={formatPKR(s.revenue30)} note="Excludes cancelled, rejected and returned" />
        <Stat label="Average order" value={s.aov30 ? formatPKR(s.aov30) : "—"} />
        <Stat label="Cancellation rate" value={pct(s.cancelRate)} />
        <Stat label="Repeat customers" value={pct(s.repeatRate)} note="Phone numbers with 2+ orders" />
        <Stat label="Emails waiting" value={s.outboxPending} href={owner ? "/admin/email" : undefined} />
      </div>

      <section className="mt-6 rounded-[var(--radius-md)] border border-line bg-surface p-4" aria-labelledby="chart-h">
        <h2 id="chart-h" className="font-bold">Orders, last 14 days</h2>
        <OrdersChart days={s.ordersByDay} />
      </section>

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

/** Real order counts per day. With no orders at all it says so instead of drawing an empty chart. */
function OrdersChart({ days }: { days: { day: string; count: number }[] }) {
  const total = days.reduce((n, d) => n + d.count, 0);
  if (total === 0) return <p className="mt-2 text-sm text-muted">No orders in the last 14 days yet.</p>;
  const max = Math.max(...days.map((d) => d.count));
  const label = (d: string) => new Date(`${d}T00:00:00+05:00`).toLocaleDateString("en-PK", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });
  return (
    <>
      <p className="mt-1 text-sm text-muted">{total} order{total === 1 ? "" : "s"} in 14 days. Busiest day: {max}.</p>
      <div role="img" aria-label={`Orders per day for the last 14 days: ${days.map((d) => `${label(d.day)} ${d.count}`).join(", ")}`} className="mt-3 flex h-32 items-end gap-1">
        {days.map((d) => (
          <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${label(d.day)}: ${d.count}`}>
            <div className={`w-full rounded-t ${d.count ? "bg-accent" : "bg-line"}`} style={{ height: d.count ? `${Math.max(6, Math.round((d.count / max) * 100))}%` : "3px" }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted" aria-hidden="true"><span>{label(days[0].day)}</span><span>{label(days[days.length - 1].day)}</span></div>
    </>
  );
}
