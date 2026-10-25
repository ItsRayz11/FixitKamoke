import { formatPKR } from "@/lib/domain/money";
import { REPAIR_LABEL, type RepairStatus } from "@/lib/domain/repair-state";
import type { RepairView } from "@/lib/repairs/repairs";

export function RepairDetails({ repair }: { repair: RepairView }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-line bg-surface p-5" aria-label={`Repair request ${repair.reference}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold" data-testid="repair-reference">{repair.reference}</h2>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-accent" data-testid="repair-status">{REPAIR_LABEL[repair.status]}</span>
      </div>
      <p className="mt-3 text-sm"><strong>{repair.deviceBrand} {repair.deviceModel}</strong></p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{repair.issue}</p>
      {repair.estimateAmount !== null && (
        <p className="mt-4 rounded bg-canvas p-3 text-sm" data-testid="repair-price">
          {repair.estimateIsConfirmed
            ? <><strong>Confirmed price:</strong> {formatPKR(repair.estimateAmount)}</>
            : <><strong>Estimate (not a final price):</strong> {formatPKR(repair.estimateAmount)}. We will confirm the price with you before any work starts.</>}
        </p>
      )}
      {repair.customerMessage && <p className="mt-3 rounded border border-line p-3 text-sm"><strong>Message from Fixit:</strong> {repair.customerMessage}</p>}
      <ol className="mt-4 space-y-1 text-sm">
        {repair.history.map((h, i) => (
          <li key={i}><span className="font-semibold">{REPAIR_LABEL[h.status as RepairStatus] ?? h.status}</span> <span className="text-muted">· {new Date(h.at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</span></li>
        ))}
      </ol>
    </section>
  );
}
