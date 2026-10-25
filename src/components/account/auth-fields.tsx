import type { ReactNode } from "react";

export const accField = "mt-1 h-12 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base";

export function Msg({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p role="alert" className="mb-4 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{error}</p>;
  if (ok) return <p role="status" className="mb-4 rounded-[var(--radius-sm)] bg-emerald-50 p-3 text-sm font-semibold text-ok">{ok}</p>;
  return null;
}

export function F({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="font-semibold">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export const Primary = ({ children, danger }: { children: ReactNode; danger?: boolean }) => (
  <button className={`min-h-12 rounded-[var(--radius-sm)] px-6 font-semibold text-white ${danger ? "bg-danger" : "bg-accent hover:bg-accent-strong"}`}>{children}</button>
);
