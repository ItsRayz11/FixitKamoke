import { getDb } from "@/lib/db";

export interface DashboardStats {
  pendingOrders: number;
  orders30: number;
  revenue30: number;
  aov30: number;
  newRepairs: number;
  lowStock: { name: string; stock: number; id: string }[];
  outboxPending: number;
  repeatRate: number | null;
  cancelRate: number | null;
  funnel: Record<string, number>;
}

const n = (v: unknown) => Number(v ?? 0);

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
  const low = await db.query<{ id: string; name: string; stock: number }>("select id, name, stock from products where published and stock <= 3 order by stock, name limit 8");
  const [ob] = await db.query<{ c: number }>("select count(*)::int as c from notification_outbox where status = 'pending'");
  const [rep] = await db.query<{ phones: number; repeaters: number }>(`
    select count(*)::int as phones, count(*) filter (where c > 1)::int as repeaters
    from (select phone, count(*) c from orders where status not in ('cancelled','rejected') group by phone) t`);
  const ev = await db.query<{ name: string; c: number }>("select name, count(*)::int as c from analytics_events where created_at > now() - interval '30 days' group by name");

  const valid = n(o.valid30), c30 = n(o.c30);
  return {
    pendingOrders: n(o.pending), orders30: c30, revenue30: n(o.rev30),
    aov30: valid ? Math.round(n(o.rev30) / valid) : 0,
    newRepairs: r?.c ?? 0, lowStock: low, outboxPending: ob?.c ?? 0,
    repeatRate: rep && rep.phones > 0 ? rep.repeaters / rep.phones : null,
    cancelRate: c30 ? n(o.cancelled30) / c30 : null,
    funnel: Object.fromEntries(ev.map((e) => [e.name, e.c])),
  };
}
