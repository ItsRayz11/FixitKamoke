"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitRepair } from "@/app/actions/repairs";

const field = "mt-1 h-12 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base";

export function RepairForm({ services }: { services: string[] }) {
  const router = useRouter();
  const [error, setError] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const [pending, start] = useTransition();
  const fe = error?.fields ?? {};
  const err = (k: string) => fe[k] && <p role="alert" className="mt-1 text-sm text-danger">{fe[k]}</p>;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const f = new FormData(e.currentTarget);
        const s = (k: string) => String(f.get(k) ?? "").trim();
        const service = s("service");
        const detail = s("issue");
        setError(null);
        start(async () => {
          const r = await submitRepair({
            customerName: s("customerName"), phone: s("phone"), email: s("email"), deviceBrand: s("deviceBrand"), deviceModel: s("deviceModel"),
            issue: service ? `${service}${detail ? ` — ${detail}` : ""}` : detail, preferredContact: s("preferredContact"), appointmentPreference: s("appointmentPreference"),
          });
          if (r.ok) router.push(`/repairs/status/${r.reference}?t=${encodeURIComponent(r.token)}`);
          else setError({ message: r.message, fields: r.fieldErrors });
        });
      }}
    >
      {error && <p role="alert" className="rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{error.message}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="deviceBrand" className="font-semibold">Phone brand</label><input id="deviceBrand" name="deviceBrand" required placeholder="e.g. Samsung" className={field} />{err("deviceBrand")}</div>
        <div><label htmlFor="deviceModel" className="font-semibold">Phone model</label><input id="deviceModel" name="deviceModel" required placeholder="e.g. Galaxy A54" className={field} />{err("deviceModel")}</div>
      </div>
      {services.length > 0 && (
        <div>
          <label htmlFor="service" className="font-semibold">What needs repair?</label>
          <select id="service" name="service" className={field} defaultValue="">
            <option value="">Not sure / something else</option>
            {services.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
      )}
      <div><label htmlFor="issue" className="font-semibold">Describe the problem</label><textarea id="issue" name="issue" required rows={4} className={`${field} h-auto py-2`} placeholder="What happens, when it started, any drops or water contact…" />{err("issue")}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="customerName" className="font-semibold">Your name</label><input id="customerName" name="customerName" required autoComplete="name" className={field} />{err("customerName")}</div>
        <div><label htmlFor="phone" className="font-semibold">Mobile number</label><input id="phone" name="phone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="03XX XXXXXXX" className={field} />{err("phone")}</div>
        <div><label htmlFor="email" className="font-semibold">Email <span className="font-normal text-muted">(optional)</span></label><input id="email" name="email" type="email" autoComplete="email" className={field} />{err("email")}</div>
        <div><label htmlFor="preferredContact" className="font-semibold">Best way to reach you</label>
          <select id="preferredContact" name="preferredContact" className={field} defaultValue="whatsapp"><option value="whatsapp">WhatsApp</option><option value="call">Phone call</option><option value="email">Email</option></select></div>
      </div>
      <div><label htmlFor="appointmentPreference" className="font-semibold">When can you visit? <span className="font-normal text-muted">(optional — or ask for a callback)</span></label><input id="appointmentPreference" name="appointmentPreference" placeholder="e.g. Saturday afternoon, or “call me back”" className={field} /></div>
      <p className="text-sm text-muted">Sending this form does not book a repair or promise a price, time or result. We will review it and contact you.</p>
      <button disabled={pending} className="min-h-12 w-full rounded-[var(--radius-sm)] bg-accent px-6 font-semibold text-white hover:bg-accent-strong disabled:bg-slate-300 sm:w-auto">{pending ? "Sending…" : "Send repair request"}</button>
    </form>
  );
}
