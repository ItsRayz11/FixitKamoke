"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { startOnlinePayment } from "@/app/actions/pay";
import { launchPayment, recallToken } from "@/lib/pay-client";

/** Shows the payment outcome, keeps checking while we wait for the provider's confirmation, and lets the customer retry or return to the order. */
export function PayResult({ state, orderNumber, amountLabel }: { state: "paid" | "failed" | "waiting"; orderNumber: string; amountLabel: string }) {
  const router = useRouter();
  // The order token lives only in this browser (saved at checkout); the server render has none.
  const token = useSyncExternalStore(() => () => {}, () => recallToken(orderNumber), () => null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // While waiting, ask the server again every few seconds (for up to a minute); the provider's notification usually arrives within seconds.
  useEffect(() => {
    if (state !== "waiting") return;
    let n = 0;
    const t = setInterval(() => { if (++n > 15) clearInterval(t); else router.refresh(); }, 4000);
    return () => clearInterval(t);
  }, [state, router]);

  const orderHref = token ? `/order/${orderNumber}?t=${encodeURIComponent(token)}` : "/track";
  async function retry() {
    if (!token || busy) return;
    setBusy(true); setMsg(null);
    const problem = launchPayment(await startOnlinePayment(orderNumber, token));
    if (problem) { setMsg(problem); setBusy(false); }
  }

  return (
    <div role="status" aria-live="polite">
      {state === "paid" && (<>
        <h1 className="text-2xl font-extrabold text-ok">Payment received</h1>
        <p className="mt-2">Thank you. We received {amountLabel} for order <strong>{orderNumber}</strong>. We will contact you to confirm the order and delivery.</p>
      </>)}
      {state === "waiting" && (<>
        <h1 className="text-2xl font-extrabold">Confirming your payment…</h1>
        <p className="mt-2 text-muted">We are waiting for the payment provider to confirm {amountLabel} for order <strong>{orderNumber}</strong>. This page updates by itself. If you were charged, please do not pay again: your order is saved and we will match the payment.</p>
      </>)}
      {state === "failed" && (<>
        <h1 className="text-2xl font-extrabold text-danger">Payment not completed</h1>
        <p className="mt-2">The payment for order <strong>{orderNumber}</strong> did not go through, so nothing was charged. Your order is saved, and you can try again.</p>
        {token && <button type="button" onClick={retry} disabled={busy} className="btn btn-primary mt-4">{busy ? "Please wait…" : "Try paying again"}</button>}
        {msg && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{msg}</p>}
      </>)}
      <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href={orderHref} className="text-accent">{token ? "View my order" : "Track my order"}</Link>
        <Link href="/shop" className="text-accent">Continue shopping</Link>
      </div>
    </div>
  );
}
