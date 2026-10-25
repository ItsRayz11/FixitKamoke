"use client";

import { useState, useTransition } from "react";
import { trackOrder } from "@/app/actions/track";
import { OrderDetails } from "@/components/order/order-details";
import type { OrderView } from "@/lib/orders/lookup";

const field = "mt-1 h-12 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base";

export default function TrackPage() {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="container-x max-w-xl py-10">
      <title>Track an order | Fixit</title>
      <h1 className="text-2xl font-extrabold">Track your order</h1>
      <p className="mt-2 text-muted">Enter your order number and the mobile number you used at checkout.</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setMsg(null); setOrder(null);
        start(async () => {
          const r = await trackOrder(String(f.get("order") ?? ""), String(f.get("phone") ?? ""));
          if (r.order) setOrder(r.order);
          else setMsg(r.error ?? "We could not find an order with those details. Please check them and try again.");
        });
      }}>
        <div><label htmlFor="order" className="font-semibold">Order number</label><input id="order" name="order" placeholder="FX-XXXXXXXXXX" required className={field} /></div>
        <div><label htmlFor="phone" className="font-semibold">Mobile number</label><input id="phone" name="phone" type="tel" inputMode="tel" required className={field} /></div>
        <button disabled={pending} className="min-h-12 w-full rounded-[var(--radius-sm)] bg-accent font-semibold text-white hover:bg-accent-strong disabled:bg-slate-300">{pending ? "Checking…" : "Track order"}</button>
      </form>
      {msg && <p role="alert" className="mt-4 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm text-danger">{msg}</p>}
      {order && <div className="mt-6"><OrderDetails order={order} /></div>}
    </div>
  );
}
