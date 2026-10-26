"use client";

import { useState, useTransition } from "react";
import { sendTransferReference } from "@/app/actions/pay";

/** After paying by bank transfer or wallet: the customer sends us the transaction ID so staff can match the payment. */
export function TransferReferenceForm({ orderNumber, token, alreadySent }: { orderNumber: string; token: string; alreadySent: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(alreadySent ? { ok: true, text: "We have your payment reference and are checking it. You can send a corrected one below if needed." } : null);
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-4 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const ref = String(new FormData(e.currentTarget).get("reference") ?? "");
        start(async () => { const r = await sendTransferReference(orderNumber, token, ref); setMsg({ ok: r.ok, text: r.message }); });
      }}
    >
      <label htmlFor="reference" className="text-sm font-semibold">Already paid? Send us the transaction ID</label>
      <div className="mt-1 flex gap-2">
        <input id="reference" name="reference" required minLength={4} maxLength={60} autoComplete="off" placeholder="e.g. the ID in your banking app" className="h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base" />
        <button disabled={pending} className="btn btn-ti !min-h-11 shrink-0">{pending ? "Sending…" : "Send"}</button>
      </div>
      <p className="mt-1 text-xs text-muted">This only tells us where to look. Your order is prepared once we have confirmed the money.</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}
