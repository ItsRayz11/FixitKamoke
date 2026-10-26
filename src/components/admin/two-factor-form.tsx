"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/actions";

const field = "mt-1 h-12 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-center text-xl tracking-[0.3em]";

/** Second sign-in step. One box takes either the 6-digit app code or a recovery code. */
export function TwoFactorForm({ action }: { action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="mt-6 space-y-4">
      <div>
        <label htmlFor="code" className="font-semibold">Code from your authenticator app</label>
        <input id="code" name="code" required autoFocus autoComplete="one-time-code" inputMode="text" spellCheck={false} autoCapitalize="characters" maxLength={14} placeholder="123 456" className={field} />
        <p className="mt-1 text-xs text-muted">Lost your phone? Type one of your recovery codes instead (each works once).</p>
      </div>
      {state.error && <p role="alert" className="rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{state.error}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-[var(--radius-sm)] bg-accent font-semibold text-white hover:bg-accent-strong disabled:bg-slate-300">{pending ? "Checking…" : "Verify and sign in"}</button>
    </form>
  );
}
