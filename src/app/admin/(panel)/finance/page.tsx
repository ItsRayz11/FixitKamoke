import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireFinance, can } from "@/lib/finance/perms";
import { overview, profitSeries } from "@/lib/finance/reports";
import { Bars, PageHead, Stat, pct, rs } from "@/components/admin/finance-ui";
import { Card } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function FinanceOverview() {
  const me = await requireFinance("finance_view");
  const db = await getDb();
  const o = await overview(db);
  const showProfit = can(me, "finance_costs");
  const series = showProfit ? await profitSeries(db, o.month.from, o.month.to, "day") : [];
  const pl = o.pl;
  const vs = (a: number, b: number) => (b === 0 ? "no earlier month to compare" : `${a >= b ? "+" : ""}${(((a - b) / Math.abs(b)) * 100).toFixed(0)}% vs last month`);
  return (
    <div>
      <PageHead title="Financial overview" note={`This month so far (${o.month.from} to ${o.month.to}). Sales count when an order is delivered or sold at the counter. Money received in advance is not income yet.`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Net sales" value={rs(pl.netSales)} note={vs(pl.netSales, o.prev.netSales)} />
        {showProfit && <Stat label="Gross profit" value={rs(pl.grossProfit)} note={`Margin ${pct(pl.grossMargin)}`} tone={pl.grossProfit >= 0 ? "ok" : "danger"} />}
        {showProfit && <Stat label="Net profit" value={rs(pl.netProfit)} note={`After ${rs(pl.operatingCosts)} of costs`} tone={pl.netProfit >= 0 ? "ok" : "danger"} />}
        <Stat label="Money on hand" value={rs(o.moneyTotal)} note="Cash, bank and wallets" href="/admin/finance/accounts" />
        <Stat label="Customers owe you" value={rs(o.receivables)} href="/admin/finance/credit" />
        <Stat label="You owe suppliers" value={rs(o.payables)} href="/admin/finance/suppliers" tone={o.payables > 0 ? "warn" : undefined} />
        {showProfit && <Stat label="Stock value" value={rs(o.inventory.valued)} note={o.inventory.unknownUnits ? `${o.inventory.unknownUnits} units have no known cost` : "All stock has a known cost"} href="/admin/inventory" />}
        <Stat label="Collected today" value={rs(o.collectedToday)} note="Actual money received" />
      </div>

      {showProfit && pl.unknownCostUnits > 0 && (
        <p role="status" className="mt-4 rounded-[var(--radius-sm)] bg-amber-50 p-3 text-sm font-semibold text-warn">
          {pl.unknownCostUnits} unit(s) sold this month had no known purchase cost, so profit on them is not counted. Enter their cost on the <Link className="underline" href="/admin/inventory">Inventory</Link> page or record purchases.
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Accounts" id="acc">
          <ul className="mt-2 divide-y divide-line text-sm">
            {o.money.map((m) => <li key={m.id} className="flex justify-between py-2"><span>{m.name}</span><span className="font-semibold">{rs(m.balance)}</span></li>)}
          </ul>
        </Card>
        {showProfit ? (
          <Card title="Net sales and profit by day" id="chart">
            <div className="mt-2"><Bars label="Net profit per day this month" data={series.map((r) => ({ label: r.period, value: r.netProfit }))} /></div>
          </Card>
        ) : (
          <Card title="What you can do here" id="you"><p className="mt-2 text-sm text-muted">Your role does not include cost and profit figures. Ask the owner if you need access.</p></Card>
        )}
      </div>

      {showProfit && (
        <Card id="costs" title="Where the month's money went">
          <table className="mt-2 w-full text-sm"><tbody className="divide-y divide-line">
            <tr><td className="py-2">Cost of goods sold</td><td className="py-2 text-right font-semibold">{rs(pl.cogs)}</td></tr>
            {pl.expenseLines.map((e) => <tr key={e.code}><td className="py-2">{e.name}</td><td className="py-2 text-right font-semibold">{rs(e.total)}</td></tr>)}
            {pl.losses !== 0 && <tr><td className="py-2">Write-offs and cash differences</td><td className="py-2 text-right font-semibold">{rs(pl.losses)}</td></tr>}
          </tbody></table>
          <p className="mt-3 text-xs text-muted">Full statement and exports: <Link className="font-semibold underline" href="/admin/finance/reports">Reports</Link>.</p>
        </Card>
      )}
    </div>
  );
}
