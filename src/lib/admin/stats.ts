import { getDb } from "@/lib/db";
import { displayName } from "@/lib/domain/display";

export interface DashboardStats {
  pendingOrders: number;
  orders30: number;
  revenue30: number;
  aov30: number;
  newRepairs: number;
  openMessages: number;
  /** Active orders paid by transfer or online whose money has not been confirmed. */
  awaitingPayment: number;
  lowStock: { name: string; stock: number; id: string }[];
  outboxPending: number;
  repeatRate: number | null;
  cancelRate: number | null;
  funnel: Record<string, number>;
}

const n = (v: unknown) => Number(v ?? 0);

/** The three queues that need a human, for the badges in the admin navigation. */
export async function getAttentionCounts(): Promise<{ orders: number; repairs: number; messages: number }> {
  const db = await getDb();
  const [o] = await db.query<{ c: number }>("select count(*)::int as c from orders where status = 'pending_confirmation'");
  const [r] = await db.query<{ c: number }>("select count(*)::int as c from repair_inquiries where status = 'new'");
  const [m] = await db.query<{ c: number }>("select count(*)::int as c from contact_messages where not handled");
  return { orders: o?.c ?? 0, repairs: r?.c ?? 0, messages: m?.c ?? 0 };
}

/** Real numbers only. Anything we cannot compute from stored data is null, never estimated. */
export async function getDashboardStats(): Promise<DashboardStats> {
  const db = await getDb();
  const [o] = await db.query<Record<string, unknown>>(`
    select
      count(*) filter (where status = 'pending_confirmation') as pending,
      count(*) filter (where created_at > now() - interval '30 days') as c30,
      coalesce(sum(total) filter (where created_at > now() - interval '30 days' and status not in ('cancelled','rejected','returned')), 0) as rev30,
      count(*) filter (where created_at > now() - interval '30 days' and status not in ('cancelled','rejected','returned')) as valid30,
      count(*) filter (where created_at > now() - interval '30 days' and status in ('cancelled','rejected')) as cancelled30
    from orders`);
  const [r] = await db.query<{ c: number }>("select count(*)::int as c from repair_inquiries where status = 'new'");
  const [msg] = await db.query<{ c: number }>("select count(*)::int as c from contact_messages where not handled");
  const [ap] = await db.query<{ c: number }>("select count(*)::int as c from orders where payment_method <> 'cod' and payment_status in ('unpaid','pending','failed') and status not in ('cancelled','rejected','returned')");
  const lowRows = await db.query<{ id: string; name: string; stock: number; variant_label: string | null }>("select id, name, stock, variant_label from products where published and stock <= 3 order by stock, name limit 8");
  const low = lowRows.map((p) => ({ id: p.id, name: displayName(p.name, p.variant_label), stock: p.stock }));
  const [ob] = await db.query<{ c: number }>("select count(*)::int as c from notification_outbox where status = 'pending'");
  const [rep] = await db.query<{ phones: number; repeaters: number }>(`
    select count(*)::int as phones, count(*) filter (where c > 1)::int as repeaters
    from (select phone, count(*) c from orders where status not in ('cancelled','rejected') group by phone) t`);
  const ev = await db.query<{ name: string; c: number }>("select name, count(*)::int as c from analytics_events where created_at > now() - interval '30 days' group by name");

  const valid = n(o.valid30), c30 = n(o.c30);
  return {
    pendingOrders: n(o.pending), orders30: c30, revenue30: n(o.rev30),
    aov30: valid ? Math.round(n(o.rev30) / valid) : 0,
    newRepairs: r?.c ?? 0, openMessages: msg?.c ?? 0, awaitingPayment: ap?.c ?? 0, lowStock: low, outboxPending: ob?.c ?? 0,
    repeatRate: rep && rep.phones > 0 ? rep.repeaters / rep.phones : null,
    cancelRate: c30 ? n(o.cancelled30) / c30 : null,
    funnel: Object.fromEntries(ev.map((e) => [e.name, e.c])),
  };
}

export interface FunnelRow { name: string; mobile: number; desktop: number; unknown: number }

/** Count-only funnel events for the last 30 days, split by phone-width vs larger screens. */
export async function getFunnelReport(): Promise<Record<string, FunnelRow>> {
  const db = await getDb();
  const rows = await db.query<{ name: string; device: string | null; c: number }>(
    "select name, device, count(*)::int as c from analytics_events where created_at > now() - interval '30 days' group by name, device");
  const out: Record<string, FunnelRow> = {};
  for (const r of rows) {
    const row = (out[r.name] ??= { name: r.name, mobile: 0, desktop: 0, unknown: 0 });
    if (r.device === "mobile") row.mobile += r.c; else if (r.device === "desktop") row.desktop += r.c; else row.unknown += r.c;
  }
  return out;
}
