"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerEstimate } from "@/app/actions/repairs";
import { formatPKR } from "@/lib/domain/money";

/** Lets the customer approve or decline the price they are looking at. The amount they saw is sent back so a price change in between is caught. */
export function EstimateResponse({ reference, token, amount, isConfirmed }: { reference: string; token: string; amount: number; isConfirmed: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const send = (decision: "approve" | "decline") =>
    start(async () => {
      const r = await answerEstimate(reference, token, decision, amount);
      setMsg({ ok: r.ok, text: r.message });
      router.refresh();
    });
  return (
    <section aria-labelledby="approve-h" className="mt-4 rounded-[var(--radius-md)] border border-accent bg-blue-50 p-4">
      <h3 id="approve-h" className="font-bold">Do you want us to go ahead?</h3>
      <p className="mt-1 text-sm">
        {isConfirmed ? "Price" : "Estimate"}: <strong data-testid="approve-amount">{formatPKR(amount)}</strong>.
        {isConfirmed ? " Work starts only after you approve." : " This is an estimate, not a final price. If it changes, we ask you again before any work starts."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => send("approve")} className="btn btn-primary !min-h-11">{pending ? "Sending…" : `Approve ${formatPKR(amount)}`}</button>
        <button type="button" disabled={pending} onClick={() => send("decline")} className="btn btn-ti !min-h-11">No thanks, cancel</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
    </section>
  );
}
