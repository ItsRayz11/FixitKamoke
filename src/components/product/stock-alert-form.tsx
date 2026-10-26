"use client";

import { useState, useTransition } from "react";
import { stockAlertAction } from "@/app/actions/stock-alert";

/** Shown only while the chosen item is sold out. One email, used for nothing else. */
export function StockAlertForm({ productId, name }: { productId: string; name: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-4 rounded-[var(--radius-md)] border border-line bg-surface p-4"
      aria-label={`Back in stock alert for ${name}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const email = String(new FormData(e.currentTarget).get("alert-email") ?? "");
        start(async () => {
          const r = await stockAlertAction(productId, email);
          setMsg({ ok: r.ok, text: r.message });
        });
      }}
    >
      <p className="text-sm font-bold">Out of stock right now</p>
      <p className="mt-0.5 text-xs text-muted">Leave your email and we will send you one message when it is back. No marketing. We use your address only for that one message and delete it within 30 days.</p>
      <div className="mt-3 flex gap-2">
        <label htmlFor="alert-email" className="sr-only">Email for the back in stock alert</label>
        <input id="alert-email" name="alert-email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" className="h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base" />
        <button disabled={pending} className="btn btn-ti !min-h-11 shrink-0">{pending ? "Saving…" : "Notify me"}</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}
