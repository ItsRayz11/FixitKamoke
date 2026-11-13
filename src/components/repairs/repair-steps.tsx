import type { RepairStatus } from "@/lib/domain/repair-state";

const STEPS = ["Describe the problem", "Receive an estimate", "Approve the repair", "Track progress"] as const;

/** Which of the four steps a repair is on. Ended requests (declined, cancelled) show no active step. */
export function repairStep(status: RepairStatus): number {
  switch (status) {
    case "new": case "reviewing": return 0;
    case "estimate_sent": case "awaiting_customer": return 1;
    case "booked": return 2;
    case "in_repair": case "ready": case "completed": return 3;
    default: return -1;
  }
}

/** A simple four-step guide. With a status it shows where the repair is; without one it just explains the process. */
export function RepairSteps({ status }: { status?: RepairStatus }) {
  const current = status ? repairStep(status) : -1;
  const done = status === "completed";
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Repair steps">
      {STEPS.map((label, i) => {
        const state = status ? (done || i < current ? "done" : i === current ? "current" : "todo") : "todo";
        return (
          <li key={label} className="min-w-0" aria-current={state === "current" ? "step" : undefined}>
            <div className={`flex items-center gap-2 text-sm font-semibold ${state === "todo" ? "text-muted" : state === "current" ? "text-accent" : "text-ok"}`}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs ${state === "done" ? "border-ok bg-emerald-50" : state === "current" ? "border-accent bg-blue-50" : "border-line bg-surface"}`}>
                {state === "done" ? <span aria-hidden="true">✓</span> : i + 1}
                {state === "done" && <span className="sr-only">Done</span>}
              </span>
              <span className="min-w-0 break-words">{label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
