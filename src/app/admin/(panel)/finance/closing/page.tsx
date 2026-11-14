import { getDb } from "@/lib/db";
import { computeClosing } from "@/lib/finance/closing";
import { requireFinance } from "@/lib/finance/perms";
import { todayPk } from "@/lib/finance/reports";
import { PageHead, rs } from "@/components/admin/finance-ui";
import { KeepForm } from "@/components/admin/keep-form";
import { Banner, Card, Field, fmtDate, inputCls, Submit, td, th } from "@/components/admin/ui";
import { closeDayAction, correctClosingAction } from "../actions";

function Row({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return <li className={`flex justify-between py-2 ${strong ? "font-bold" : ""}`}><span>{l}</span><span>{v}</span></li>;
}

export const dynamic = "force-dynamic";

export default async function Closing({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; date?: string }> }) {
  const me = await requireFinance("finance_close");
  const sp = await searchParams;
  const db = await getDb();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : await todayPk(db);
  const f = await computeClosing(db, date);
  const closed = (await db.query<{ id: string; counted: number; difference: number }>("select id, counted, difference from daily_closings where close_date = $1 and status = 'final' and account_id = (select id from fin_accounts where code = '1000')", [date]))[0];
  const history = await db.query<{ id: string; close_date: string; expected: number; counted: number; difference: number; status: string; closed_by: string; approved_by: string | null; closed_at: string }>(
    "select id, close_date::text, expected, counted, difference, status, closed_by, approved_by, closed_at::text from daily_closings order by close_date desc, closed_at desc limit 30");
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <PageHead title="Daily closing" note="Count the cash drawer at the end of the day. Any difference is recorded openly, and a finished day can only be changed by the owner, with a reason." />
        <Banner ok={sp.ok} error={sp.error} />
        <form method="get" className="mb-4 flex items-end gap-3"><label className="text-sm font-semibold">Day<input type="date" name="date" defaultValue={date} className="mt-1 block h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm" /></label><button className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-5 text-sm font-semibold text-white">Show</button></form>
        <Card title={`Cash drawer, ${date}`} id="fig">
          <ul className="mt-2 divide-y divide-line text-sm">
            <Row l="Opening cash" v={rs(f.opening)} /><Row l="Cash received" v={rs(f.received)} /><Row l="Cash paid out" v={rs(f.paidOut)} />
            <Row l="Transfers in/out of the drawer" v={rs(f.transfersNet)} /><Row l="Expected closing cash" v={rs(f.expected)} strong />
            {closed && <><Row l="Counted" v={rs(closed.counted)} /><Row l="Difference" v={rs(closed.difference)} strong /></>}
          </ul>
        </Card>
        <h2 className="mt-8 font-bold">History</h2>
        <div className="mt-2 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface"><table className="w-full min-w-[34rem]"><thead className="border-b border-line"><tr><th className={th}>Day</th><th className={th}>Expected</th><th className={th}>Counted</th><th className={th}>Difference</th><th className={th}>By</th><th className={th}>Status</th></tr></thead>
          <tbody className="divide-y divide-line">{history.length === 0 && <tr><td className={td} colSpan={6}>No closings yet.</td></tr>}
            {history.map((h) => <tr key={h.id} className={h.status === "superseded" ? "opacity-50" : ""}><td className={td}>{h.close_date}</td><td className={td}>{rs(h.expected)}</td><td className={td}>{rs(h.counted)}</td><td className={`${td} ${h.difference !== 0 ? "font-semibold text-warn" : ""}`}>{rs(h.difference)}</td><td className={td}>{h.closed_by}{h.approved_by && <span className="block text-xs text-muted">approved by {h.approved_by}</span>}<span className="block text-xs text-muted">{fmtDate(h.closed_at)}</span></td><td className={td}>{h.status}</td></tr>)}</tbody></table></div>
      </div>
      <div className="space-y-6">
        {!closed ? (
          <KeepForm action={closeDayAction} className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
            <h2 className="font-bold">Close this day</h2><input type="hidden" name="date" value={date} />
            <Field label="Cash you counted (Rs.)" id="c-c" hint={`Expected ${rs(f.expected)}.`}><input id="c-c" name="counted" inputMode="numeric" required className={inputCls} /></Field>
            <Field label="Note" id="c-n"><input id="c-n" name="note" className={inputCls} /></Field>
            <Submit>Close the day</Submit>
          </KeepForm>
        ) : me.role === "owner" ? (
          <KeepForm action={correctClosingAction} className="space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
            <h2 className="font-bold">Correct this closing (owner)</h2><input type="hidden" name="id" value={closed.id} />
            <Field label="Correct cash count (Rs.)" id="k-c"><input id="k-c" name="counted" inputMode="numeric" required className={inputCls} /></Field>
            <Field label="Reason" id="k-r"><input id="k-r" name="reason" required className={inputCls} /></Field>
            <Submit>Save correction</Submit>
          </KeepForm>
        ) : <p className="rounded-[var(--radius-md)] border border-line bg-surface p-4 text-sm text-muted">This day is closed. Only the owner can correct it.</p>}
      </div>
    </div>
  );
}
