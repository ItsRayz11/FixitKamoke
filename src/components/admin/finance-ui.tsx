import Link from "next/link";
import type { ReactNode } from "react";

/** Rupees, also for negatives (formatPKR rejects them). */
export const rs = (n: number) => `${n < 0 ? "-" : ""}Rs. ${Math.abs(Math.round(n)).toLocaleString("en-PK")}`;
export const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);

export function Stat({ label, value, note, tone, href }: { label: string; value: string; note?: string; tone?: "ok" | "danger" | "warn"; href?: string }) {
  const color = tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "";
  const inner = (
    <div className="h-full rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full hover:opacity-90">{inner}</Link> : inner;
}

/** Plain SVG bars: no chart library. Negative values hang below the axis. */
export function Bars({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  if (!data.length) return <p className="text-sm text-muted">No data in this range yet.</p>;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const w = 28; const gap = 8; const h = 120; const mid = h / 2;
  const width = data.length * (w + gap);
  return (
    <figure>
      <svg role="img" aria-label={label} viewBox={`0 0 ${Math.max(width, 100)} ${h + 22}`} className="h-44 w-full" preserveAspectRatio="xMinYMid meet">
        <line x1="0" x2={width} y1={mid} y2={mid} stroke="currentColor" strokeOpacity="0.2" />
        {data.map((d, i) => {
          const bh = (Math.abs(d.value) / max) * (mid - 4);
          return (
            <g key={d.label} transform={`translate(${i * (w + gap)},0)`}>
              <title>{`${d.label}: ${rs(d.value)}`}</title>
              <rect x="0" width={w} y={d.value >= 0 ? mid - bh : mid} height={Math.max(bh, 1)} rx="3" className={d.value >= 0 ? "fill-[var(--accent,#2563eb)]" : "fill-[var(--danger,#dc2626)]"} />
              <text x={w / 2} y={h + 12} textAnchor="middle" fontSize="8" fill="currentColor" fillOpacity="0.6">{d.label.slice(5)}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function DateRange({ from, to, extra }: { from: string; to: string; extra?: ReactNode }) {
  return (
    <form className="flex flex-wrap items-end gap-3" method="get">
      <label className="text-sm font-semibold">From<input type="date" name="from" defaultValue={from} className="mt-1 block h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm" /></label>
      <label className="text-sm font-semibold">To<input type="date" name="to" defaultValue={to} className="mt-1 block h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm" /></label>
      {extra}
      <button className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-5 text-sm font-semibold text-white">Show</button>
    </form>
  );
}

export function PageHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-extrabold">{title}</h1>
      {note && <p className="mt-1 max-w-3xl text-sm text-muted">{note}</p>}
    </div>
  );
}

export const selectCls = "mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm";
export const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10); // Pakistan date, for form defaults only
