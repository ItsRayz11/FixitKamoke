"use client";

import { useState, useTransition } from "react";
import { sendContact } from "@/app/actions/contact";

const field = "mt-1 h-12 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base";

export function ContactForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const [pending, start] = useTransition();
  const err = (k: string) => error?.fields?.[k] && <p role="alert" className="mt-1 text-sm text-danger">{error.fields[k]}</p>;

  if (done) {
    return (
      <div role="status" className="rounded-[var(--radius-md)] border border-line bg-emerald-50 p-5 text-ok">
        <p className="font-semibold">Thank you, your message has been received.</p>
        <p className="mt-1 text-sm">We will reply using the phone number or email you gave us.</p>
      </div>
    );
  }
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      if (pending) return;
      const f = new FormData(e.currentTarget);
      const s = (k: string) => String(f.get(k) ?? "").trim();
      setError(null);
      start(async () => {
        const r = await sendContact({ name: s("name"), phone: s("phone"), email: s("email"), message: s("message"), website: s("website") });
        if (r.ok) setDone(true);
        else setError({ message: r.message, fields: r.fieldErrors });
      });
    }}>
      {error && <p role="alert" className="rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{error.message}</p>}
      <div><label htmlFor="name" className="font-semibold">Your name</label><input id="name" name="name" required autoComplete="name" className={field} />{err("name")}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="phone" className="font-semibold">Mobile number</label><input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className={field} />{err("phone")}</div>
        <div><label htmlFor="email" className="font-semibold">Email</label><input id="email" name="email" type="email" autoComplete="email" className={field} />{err("email")}</div>
      </div>
      <div><label htmlFor="message" className="font-semibold">Message</label><textarea id="message" name="message" required rows={5} className={`${field} h-auto py-2`} />{err("message")}</div>
      {/* Honeypot, hidden from people and assistive technology */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <button disabled={pending} className="min-h-12 rounded-[var(--radius-sm)] bg-accent px-6 font-semibold text-white hover:bg-accent-strong disabled:bg-slate-300">{pending ? "Sending…" : "Send message"}</button>
    </form>
  );
}
