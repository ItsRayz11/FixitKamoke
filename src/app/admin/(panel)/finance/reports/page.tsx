import Link from "next/link";
import { getDb } from "@/lib/db";
import { REPORTS } from "@/lib/finance/report-defs";
import { can, requireFinance } from "@/lib/finance/perms";
import { monthRange } from "@/lib/finance/reports";
import { DateRange, PageHead } from "@/components/admin/finance-ui";
import { td, th } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const fmt = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-PK") : v == null || v === "" ? "—" : /^-?\d+(\.\d+)?$/.test(String(v)) ? Number(v).toLocaleString("en-PK", { maximumFractionDigits: 2 }) : String(v));

export default async function Reports({ searchParams }: { searchParams: Promise<{ report?: string; from?: string; to?: string; account?: string }> }) {
  const me = await requireFinance("finance_view");
  const sp = await searchParams;
  const db = await getDb();
  const month = await monthRange(db);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : month.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : month.to;
  const allowed = Object.entries(REPORTS).filter(([, d]) => can(me, d.perm));
  const key = allowed.find(([k]) => k === sp.report)?.[0] ?? allowed[0]?.[0];
  const account = sp.account ?? "1000";
  const data = key ? await REPORTS[key].build(db, from, to, account) : null;
  const q = (r: string) => `?report=${r}&from=${from}&to=${to}${r === "accounts" ? `&account=${account}` : ""}`;
  return (
    <div>
      <PageHead title="Reports" note="Pick a report and a date range. Sales reports and cash collection reports are separate on purpose: a credit sale is a sale but not cash." />
      <nav aria-label="Reports" className="mb-4 flex flex-wrap gap-2">
        {allowed.map(([k, d]) => <Link key={k} href={q(k)} aria-current={k === key ? "page" : undefined} className={`min-h-11 rounded-full border px-4 py-2.5 text-sm font-semibold ${k === key ? "border-accent bg-accent text-white" : "border-line bg-surface"}`}>{d.label}</Link>)}
      </nav>
      {data && key && (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <DateRange from={from} to={to} extra={<><input type="hidden" name="report" value={key} />{key === "accounts" && <label className="text-sm font-semibold">Account code<input name="account" defaultValue={account} className="mt-1 block h-11 w-28 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm" /></label>}</>} />
            <div className="flex gap-2 text-sm font-semibold">
              <a className="min-h-11 rounded-[var(--radius-sm)] border border-line px-4 py-2.5" href={`/admin/finance/reports/export${q(key)}&format=csv`}>Download CSV</a>
              <a className="min-h-11 rounded-[var(--radius-sm)] border border-line px-4 py-2.5" href={`/admin/finance/reports/export${q(key)}&format=xlsx`}>Download Excel (.xlsx)</a>
            </div>
          </div>
          <h2 className="font-bold">{data.title}</h2>
          {data.note && <p className="mt-1 text-xs text-muted">{data.note}</p>}
          <div className="mt-3 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
            <table className="w-full min-w-[34rem]"><thead className="border-b border-line"><tr>{data.cols.map((c) => <th key={c.key} className={th}>{c.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{data.rows.length === 0 && <tr><td className={td} colSpan={data.cols.length}>Nothing in this range.</td></tr>}
                {data.rows.map((r, i) => <tr key={i}>{data.cols.map((c) => <td key={c.key} className={td}>{fmt(r[c.key])}</td>)}</tr>)}</tbody></table>
          </div>
        </>
      )}
    </div>
  );
}
