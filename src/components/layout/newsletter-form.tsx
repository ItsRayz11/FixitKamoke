"use client";

import { useState, useTransition } from "react";
import { subscribeAction } from "@/app/actions/newsletter";

export function NewsletterForm() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const form = e.currentTarget;
        const f = new FormData(form);
        start(async () => {
          const r = await subscribeAction(String(f.get("email") ?? ""), f.get("consent") === "on");
          setMsg({ ok: r.ok, text: r.message });
          if (r.ok) form.reset();
        });
      }}
    >
      <p id="nl-title" className="text-sm font-semibold text-white">Email updates (optional)</p>
      <p className="text-xs text-slate-300">We only send marketing emails if you tick the box.</p>
      <div className="flex gap-2">
        <input id="nl-email" name="email" type="email" required autoComplete="email" aria-label="Newsletter sign-up" placeholder="you@example.com" className="h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-white/20 bg-graphite-2 px-3 text-sm text-white placeholder:text-slate-400" />
        <button disabled={pending} className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">{pending ? "…" : "Sign up"}</button>
      </div>
      <label className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" name="consent" className="mt-0.5 h-4 w-4" /> Yes, send me news and offers from Fixit. I can unsubscribe at any time.</label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs font-semibold ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
    </form>
  );
}
