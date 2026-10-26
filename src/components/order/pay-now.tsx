"use client";

import { useState } from "react";
import { startOnlinePayment } from "@/app/actions/pay";
import { launchPayment } from "@/lib/pay-client";

/** For an online order that is not paid yet: starts (or restarts) the payment. */
export function PayNow({ orderNumber, token, failed }: { orderNumber: string; token: string; failed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(failed ? "We could not open the payment page. Nothing was charged. Please try again." : null);
  async function go() {
    if (busy) return;
    setBusy(true); setMsg(null);
    const problem = launchPayment(await startOnlinePayment(orderNumber, token));
    if (problem) { setMsg(problem); setBusy(false); }
  }
  return (
    <section aria-labelledby="paynow" className="mt-4 rounded-[var(--radius-md)] border border-accent bg-surface p-5">
      <h2 id="paynow" className="font-bold">Your payment is still to be completed</h2>
      <p className="mt-1 text-sm text-muted">Your order is saved. It is only prepared once the payment provider confirms your payment to us.</p>
      <button type="button" onClick={go} disabled={busy} className="btn btn-primary mt-3">{busy ? "Please wait…" : "Pay now"}</button>
      {msg && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{msg}</p>}
    </section>
  );
}
