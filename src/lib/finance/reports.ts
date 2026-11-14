import type { Queryable } from "@/lib/db";
import { aging } from "./credit";
import { balances } from "./ledger";
import { inventoryValue } from "./stock";

const num = (v: unknown) => Number(v ?? 0);

export async function todayPk(q: Queryable): Promise<string> {
  return (await q.query<{ d: string }>("select (now() at time zone 'Asia/Karachi')::date::text as d"))[0].d;
}
export async function monthRange(q: Queryable, offset = 0): Promise<{ from: string; to: string }> {
  const r = await q.query<{ f: string; t: string }>(
    "select (date_trunc('month', now() at time zone 'Asia/Karachi') + ($1::int * interval '1 month'))::date::text as f, ((date_trunc('month', now() at time zone 'Asia/Karachi') + (($1::int + 1) * interval '1 month'))::date - 1)::text as t", [offset]);
  return { from: r[0].f, to: r[0].t };
}

export interface ProfitAndLoss {
  grossSales: number; discounts: number; refunds: number; netSales: number; cogs: number; grossProfit: number; otherIncome: number;
  expenses: number; losses: number; operatingCosts: number; netProfit: number; grossMargin: number | null; netMargin: number | null;
  expenseLines: { code: string; name: string; total: number }[];
  /** Units sold in the period whose purchase cost is unknown. COGS and profit exclude them; never guessed. */
  unknownCostUnits: number;
}

/**
 * Profit for a date range, straight from the ledger so it always agrees with the books. Sales are recognised at delivery (or at the
 * counter), customer advances are not income, and refunds and returns come off sales.
 */
export async function profitAndLoss(q: Queryable, from: string, to: string): Promise<ProfitAndLoss> {
  const rows = await q.query<{ code: string; name: string; net: string | number }>(
    `select a.code, a.name, coalesce(sum(e.credit - e.debit),0) as net from fin_accounts a
     join fin_entries e on e.account_id = a.id join fin_journals j on j.id = e.journal_id
     where j.effective_date between $1::date and $2::date and a.type in ('income','expense') group by a.code, a.name`, [from, to]);
  const v = (code: string) => num(rows.find((r) => r.code === code)?.net);
  const grossSales = v("4000") + v("4010") + v("4020");
  const discounts = -v("4090");
  const refunds = -v("4200");
  const netSales = grossSales - discounts - refunds;
  const cogs = -v("5000");
  const grossProfit = netSales - cogs;
  const otherIncome = v("4100");
  const expenseLines = rows.filter((r) => r.code.startsWith("6")).map((r) => ({ code: r.code, name: r.name, total: -num(r.net) })).filter((r) => r.total !== 0);
  const expenses = expenseLines.reduce((s, r) => s + r.total, 0);
  const losses = -v("5100") - v("5200");
  const operatingCosts = expenses + losses;
  const netProfit = grossProfit + otherIncome - operatingCosts;
  const unk = await q.query<{ n: string | number }>(
    `select coalesce((select sum(coalesce(i.cost_unknown_qty, i.quantity)) from order_items i join orders o on o.id = i.order_id
        where o.delivered_at is not null and (o.delivered_at at time zone 'Asia/Karachi')::date between $1::date and $2::date), 0)
       + coalesce((select sum(i.cost_unknown_qty) from pos_sale_items i join pos_sales s on s.id = i.pos_sale_id
        where s.status = 'completed' and (s.sold_at at time zone 'Asia/Karachi')::date between $1::date and $2::date), 0) as n`, [from, to]);
  return {
    grossSales, discounts, refunds, netSales, cogs, grossProfit, otherIncome, expenses, losses, operatingCosts, netProfit,
    grossMargin: netSales > 0 ? grossProfit / netSales : null, netMargin: netSales + otherIncome > 0 ? netProfit / (netSales + otherIncome) : null,
    expenseLines, unknownCostUnits: num(unk[0].n),
  };
}

export type Grain = "day" | "week" | "month";
/** Daily, weekly or monthly comparison of sales, cost and profit. */
export async function profitSeries(q: Queryable, from: string, to: string, grain: Grain) {
  const g = ({ day: "day", week: "week", month: "month" } as const)[grain];
  const rows = await q.query<{ period: string; net_sales: string | number; cogs: string | number; costs: string | number; other: string | number }>(
    `select to_char(date_trunc('${g}', j.effective_date), 'YYYY-MM-DD') as period,
       coalesce(sum(case when a.code in ('4000','4010','4020','4090','4200') then e.credit - e.debit end),0) as net_sales,
       coalesce(sum(case when a.code = '5000' then e.debit - e.credit end),0) as cogs,
       coalesce(sum(case when a.code like '6%' or a.code in ('5100','5200') then e.debit - e.credit end),0) as costs,
       coalesce(sum(case when a.code = '4100' then e.credit - e.debit end),0) as other
     from fin_entries e join fin_journals j on j.id = e.journal_id join fin_accounts a on a.id = e.account_id
     where j.effective_date between $1::date and $2::date and a.type in ('income','expense') group by 1 order by 1`, [from, to]);
  return rows.map((r) => {
    const [netSales, cogs, costs, other] = [num(r.net_sales), num(r.cogs), num(r.costs), num(r.other)];
    return { period: r.period, netSales, cogs, grossProfit: netSales - cogs, expenses: costs, netProfit: netSales - cogs + other - costs };
  });
}

/** What the shop is worth in cash terms right now. */
export async function overview(q: Queryable) {
  const month = await monthRange(q);
  const last = await monthRange(q, -1);
  const [pl, prev, bal, inv, recv, pay, today] = await Promise.all([
    profitAndLoss(q, month.from, month.to), profitAndLoss(q, last.from, last.to), balances(q), inventoryValue(q), aging(q, "receivable"), aging(q, "payable"), todayPk(q),
  ]);
  const money = bal.filter((b) => b.kind === "cash" || b.kind === "bank" || b.kind === "wallet");
  const collected = await collectedToday(q, today);
  return {
    month, today, pl, prev, money, moneyTotal: money.reduce((s, m) => s + m.balance, 0), inventory: inv,
    receivables: recv.reduce((s, r) => s + r.total, 0), payables: pay.reduce((s, r) => s + r.total, 0), collectedToday: collected,
  };
}
async function collectedToday(q: Queryable, day: string) {
  const r = await q.query<{ n: string | number }>(
    `select coalesce(sum(e.debit),0) as n from fin_entries e join fin_journals j on j.id = e.journal_id join fin_accounts a on a.id = e.account_id
     where a.kind in ('cash','bank','wallet') and j.effective_date = $1::date and coalesce(j.ref_type,'') not in ('transfer','closing','owner','account','reconcile') and j.reverses_id is null`, [day]);
  return num(r[0].n);
}

/** Actual money in and out by account and source: kept apart from the sales report on purpose (credit sales and advances differ). */
export async function cashCollection(q: Queryable, from: string, to: string) {
  const r = await q.query<{ account: string; source: string; received: string | number; paid_out: string | number }>(
    `select a.name as account, coalesce(j.ref_type, 'other') as source, sum(e.debit) as received, sum(e.credit) as paid_out
     from fin_entries e join fin_journals j on j.id = e.journal_id join fin_accounts a on a.id = e.account_id
     where a.kind in ('cash','bank','wallet') and j.effective_date between $1::date and $2::date group by 1, 2 order by 1, 2`, [from, to]);
  return r.map((x) => ({ account: x.account, source: x.source, received: num(x.received), paidOut: num(x.paid_out) }));
}

/** Sales by document (not cash): delivered web orders, counter sales and services. */
export async function salesReport(q: Queryable, from: string, to: string) {
  return q.query<{ date: string; source: string; ref: string; gross: number; discount: number; net: number; cost: string | number | null; unknown_units: string | number }>(
    `select (o.delivered_at at time zone 'Asia/Karachi')::date::text as date, 'web order' as source, o.order_number as ref, o.subtotal + o.shipping_fee as gross, o.discount, o.total as net,
       (select sum(round(greatest(i.quantity - coalesce(i.cost_unknown_qty, i.quantity), 0) * coalesce(i.unit_cost, 0))) from order_items i where i.order_id = o.id) as cost,
       (select coalesce(sum(coalesce(i.cost_unknown_qty, i.quantity)),0) from order_items i where i.order_id = o.id) as unknown_units
     from orders o where o.delivered_at is not null and (o.delivered_at at time zone 'Asia/Karachi')::date between $1::date and $2::date
     union all
     select (s.sold_at at time zone 'Asia/Karachi')::date::text, 'counter sale', s.receipt_no, s.subtotal, s.discount, s.total,
       (select sum(round(greatest(i.quantity - i.cost_unknown_qty, 0) * coalesce(i.unit_cost, 0))) from pos_sale_items i where i.pos_sale_id = s.id),
       (select coalesce(sum(i.cost_unknown_qty),0) from pos_sale_items i where i.pos_sale_id = s.id)
     from pos_sales s where s.status = 'completed' and (s.sold_at at time zone 'Asia/Karachi')::date between $1::date and $2::date
     union all
     select v.occurred_on::text, 'service', v.kind, v.fee_amount, 0, v.fee_amount, 0, 0 from service_entries v where v.voided_at is null and v.occurred_on between $1::date and $2::date
     order by 1, 3`, [from, to]);
}

export async function inventoryValuation(q: Queryable) {
  return q.query<{ name: string; sku: string | null; stock: number; avg_cost: string | null; valued_units: number; unknown_units: number; value: string | number }>(
    `select name || coalesce(' (' || variant_label || ')', '') as name, sku, stock, avg_cost, greatest(stock - unvalued_units, 0) as valued_units, least(unvalued_units, stock) as unknown_units,
       round(greatest(stock - unvalued_units, 0) * coalesce(avg_cost, 0)) as value
     from products where stock > 0 order by name`);
}

export async function productProfitability(q: Queryable, from: string, to: string) {
  return q.query<{ product: string; units: string | number; revenue: string | number; cogs: string | number; unknown_units: string | number }>(
    `select product, sum(units) as units, sum(revenue) as revenue, sum(cogs) as cogs, sum(unknown_units) as unknown_units from (
       select i.product_name as product, i.quantity - i.returned_qty as units, i.line_total * (i.quantity - i.returned_qty) / i.quantity as revenue,
         round(greatest(i.quantity - coalesce(i.cost_unknown_qty, i.quantity), 0) * coalesce(i.unit_cost, 0)) as cogs, coalesce(i.cost_unknown_qty, i.quantity) as unknown_units
       from order_items i join orders o on o.id = i.order_id where o.delivered_at is not null and (o.delivered_at at time zone 'Asia/Karachi')::date between $1::date and $2::date
       union all
       select i.product_name, i.quantity, i.line_total, round(greatest(i.quantity - i.cost_unknown_qty, 0) * coalesce(i.unit_cost, 0)), i.cost_unknown_qty
       from pos_sale_items i join pos_sales s on s.id = i.pos_sale_id where s.status = 'completed' and (s.sold_at at time zone 'Asia/Karachi')::date between $1::date and $2::date
     ) t group by product order by sum(revenue) - sum(cogs) desc`, [from, to]);
}

export async function supplierPurchases(q: Queryable, from: string, to: string) {
  return q.query<{ supplier: string; purchases: string | number; total: string | number; paid: string | number }>(
    `select coalesce(s.name, 'No supplier') as supplier, count(*) as purchases, sum(p.total_cost) as total, sum(p.paid_amount) as paid
     from purchases p left join suppliers s on s.id = p.supplier_id where p.status = 'received' and p.purchase_date between $1::date and $2::date group by 1 order by 3 desc`, [from, to]);
}

export async function accountMovements(q: Queryable, account: string, from: string, to: string) {
  return q.query<{ date: string; memo: string; ref_type: string | null; debit: number; credit: number; actor: string | null }>(
    `select j.effective_date::text as date, j.memo, j.ref_type, e.debit, e.credit, j.actor
     from fin_entries e join fin_journals j on j.id = e.journal_id join fin_accounts a on a.id = e.account_id
     where (a.code = $1 or a.id::text = $1) and j.effective_date between $2::date and $3::date order by j.effective_date, j.created_at, e.id`, [account, from, to]);
}

export async function closingsReport(q: Queryable, from: string, to: string) {
  return q.query(`select close_date::text as date, opening, received, paid_out, transfers_net, expected, counted, difference, status, closed_by, approved_by, closed_at::text as closed_at
    from daily_closings where close_date between $1::date and $2::date order by close_date, closed_at`, [from, to]);
}

export interface StockCoverRow { id: string; name: string; sku: string | null; stock: number; sold30: number; perDay: number; daysLeft: number | null; suggest: number }
/**
 * Sales speed per product over the last 30 days (customer orders and counter sales, net of cancellations and returns),
 * how many days the shelf will last at that speed, and how many to order to cover the next 30 days. Nothing is guessed:
 * a product with no sales has no "days left".
 */
export async function stockCover(q: Queryable): Promise<StockCoverRow[]> {
  const r = await q.query<{ id: string; name: string; variant_label: string | null; sku: string | null; stock: number; sold: string | number }>(
    `select p.id, p.name, p.variant_label, p.sku, p.stock, coalesce(-sum(m.qty_delta) filter (where m.kind in ('sale','sale_cancel','pos_sale','return')), 0) as sold
     from products p left join stock_movements m on m.product_id = p.id and m.created_at >= now() - interval '30 days'
     where not p.archived group by p.id order by p.name`);
  return r.map((x) => {
    const sold30 = Math.max(0, Number(x.sold));
    const perDay = sold30 / 30;
    return { id: x.id, name: x.variant_label ? `${x.name} (${x.variant_label})` : x.name, sku: x.sku, stock: x.stock, sold30, perDay: Math.round(perDay * 100) / 100,
      daysLeft: perDay > 0 ? Math.floor(x.stock / perDay) : null, suggest: Math.max(0, Math.ceil(perDay * 30) - x.stock) };
  });
}

/** Every stock change in a date range (Pakistan time), newest first: the stock ledger as a report. */
export async function stockMovementsReport(q: Queryable, from: string, to: string) {
  return q.query<{ date: string; product: string; kind: string; qty: number; unit_cost: string | number | null; reference: string | null; by: string | null }>(
    `select to_char(m.created_at at time zone 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') as date, p.name as product, m.kind, m.qty_delta as qty, m.unit_cost,
            coalesce(m.note, m.ref_type) as reference, m.actor as by
     from stock_movements m join products p on p.id = m.product_id
     where (m.created_at at time zone 'Asia/Karachi')::date between $1::date and $2::date order by m.created_at desc, m.id desc limit 5000`, [from, to]);
}
