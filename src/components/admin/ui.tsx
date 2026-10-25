import type { ReactNode } from "react";

export const inputCls = "mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm";

export function Banner({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p role="alert" className="mb-4 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{error}</p>;
  if (ok) return <p role="status" className="mb-4 rounded-[var(--radius-sm)] bg-emerald-50 p-3 text-sm font-semibold text-ok">{ok}</p>;
  return null;
}

export function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Submit({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return <button className={`min-h-11 rounded-[var(--radius-sm)] px-5 text-sm font-semibold text-white ${danger ? "bg-danger hover:opacity-90" : "bg-accent hover:bg-accent-strong"}`}>{children}</button>;
}

export function Card({ title, children, id }: { title?: string; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
      {title && <h2 id={id} className="font-bold">{title}</h2>}
      {children}
    </section>
  );
}

export const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
export const td = "px-3 py-2 text-sm";

export const fmtDate = (d: Date | string) => new Date(d).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
