"use client";

import { useState, useTransition } from "react";
import { trackRepair } from "@/app/actions/repairs";
import { RepairDetails } from "@/components/repairs/repair-details";
import type { RepairView } from "@/lib/repairs/repairs";

const field = "mt-1 h-12 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base";

export default function RepairTrackPage() {
  const [repair, setRepair] = useState<RepairView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="container-x max-w-xl py-10">
      <title>Check repair status | Fixit</title>
      <h1 className="text-2xl font-extrabold">Check your repair request</h1>
      <p className="mt-2 text-muted">Enter your reference and the mobile number you used.</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setMsg(null); setRepair(null);
        start(async () => {
          const r = await trackRepair(String(f.get("reference") ?? ""), String(f.get("phone") ?? ""));
          if (r.repair) setRepair(r.repair);
          else setMsg(r.error ?? "We could not find a request with those details. Please check them and try again.");
        });
      }}>
        <div><label htmlFor="reference" className="font-semibold">Reference</label><input id="reference" name="reference" placeholder="RP-XXXXXXXXXX" required className={field} /></div>
        <div><label htmlFor="phone" className="font-semibold">Mobile number</label><input id="phone" name="phone" type="tel" inputMode="tel" required className={field} /></div>
        <button disabled={pending} className="min-h-12 w-full rounded-[var(--radius-sm)] bg-accent font-semibold text-white hover:bg-accent-strong disabled:bg-slate-300">{pending ? "Checking…" : "Check status"}</button>
      </form>
      {msg && <p role="alert" className="mt-4 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm text-danger">{msg}</p>}
      {repair && <div className="mt-6"><RepairDetails repair={repair} /></div>}
    </div>
  );
}
