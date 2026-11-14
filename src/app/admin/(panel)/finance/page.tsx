import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireFinance, can } from "@/lib/finance/perms";
import { overview, profitSeries } from "@/lib/finance/reports";
import { Bars, PageHead, Stat, pct, rs } from "@/components/admin/finance-ui";
import { Card } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

async function setupChecklist(db: Awaited<ReturnType<typeof getDb>>, o: Awaited<ReturnType<typeof overview>>) {
  const n = async (sql: string) => Number((await db.query<{ n: string | number }>(sql))[0].n);
  const [suppliers, purchases, closings, demos] = await Promise.all([
    n("select count(*) n from suppliers"), n("select count(*) n from purchases where received_at is not null"),
    n("select count(*) n from daily_closings"), n("select count(*) n from products where name ilike 'demo%' and not archived")]);
  return [
    { label: "Enter the opening balance of cash, bank, JazzCash and Easypaisa", done: o.money.some((m) => m.balance !== 0), href: "/admin/finance/accounts", why: "Until then, money on hand and the cash closing start from zero." },
    { label: "Enter the cost of your existing stock", done: o.inventory.unknownUnits === 0, href: "/admin/inventory", why: `${o.inventory.unknownUnits} units have no cost, so profit on them cannot be counted.` },
    { label: "Remove or archive demo products", done: demos === 0, href: "/admin/products", why: `${demos} product(s) are named DEMO and still count in stock and stock value.` },
    { label: "Add your suppliers", done: suppliers > 0, href: "/admin/finance/suppliers", why: "Needed to record purchases and what you owe." },
    { label: "Record your next stock purchase", done: purchases > 0, href: "/admin/finance/purchases", why: "Purchases set the real cost of new stock automatically." },
    { label: "Close your first day", done: closings > 0, href: "/admin/finance/closing", why: "Compares counted cash with the books each evening." },
  ];
}

export default async function FinanceOverview() {
  const me = await requireFinance("finance_view");
  const db = await getDb();
  const o = await overview(db);
  const showProfit = can(me, "finance_costs");
  const series = showProfit ? await profitSeries(db, o.month.from, o.month.to, "day") : [];
  const pl = o.pl;
  const setup = me.role === "owner" ? await setupChecklist(db, o) : [];
  const vs = (a: number, b: number) => (b === 0 ? "no earlier month to compare" : `${a >= b ? "+" : ""}${(((a - b) / Math.abs(b)) * 100).toFixed(0)}% vs last month`);
  return (
    <div>
      <PageHead title="Financial overview" note={`This month so far (${o.month.from} to ${o.month.to}). Sales count when an order is delivered or sold at the counter. Money received in advance is not income yet.`} />
      {setup.some((t) => !t.done) && (
        <Card title="Finish setting up" id="setup">
          <ul className="mt-2 space-y-2 text-sm">
            {setup.map((t) => (
              <li key={t.label} className="flex items-start gap-2">
                <span aria-hidden className={t.done ? "text-ok" : "text-warn"}>{t.done ? "✓" : "○"}</span>
                <span>{t.done ? <span className="text-muted line-through">{t.label}</span> : <Link className="font-semibold underline" href={t.href}>{t.label}</Link>}{!t.done && <span className="block text-xs text-muted">{t.why}</span>}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
