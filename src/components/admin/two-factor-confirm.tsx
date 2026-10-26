"use client";

import { useActionState } from "react";
import type { SetupState } from "@/app/admin/(panel)/security/actions";

/** Confirms the first code, then shows the recovery codes exactly once. */
export function TwoFactorConfirm({ action }: { action: (s: SetupState, f: FormData) => Promise<SetupState> }) {
  const [state, run, pending] = useActionState(action, {});
  if (state.codes) {
    return (
      <div role="status" className="mt-4 rounded-[var(--radius-md)] border border-ok bg-emerald-50 p-4">
        <p className="font-bold text-ok">Two-step sign-in is on.</p>
        <p className="mt-1 text-sm">Save these recovery codes somewhere safe (a password manager or a printed note). Each works once if you lose your phone. <strong>They will not be shown again.</strong></p>
        <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm" aria-label="Recovery codes" data-testid="recovery-codes">
          {state.codes.map((c) => <li key={c} className="rounded-[var(--radius-sm)] bg-white px-3 py-2">{c}</li>)}
        </ul>
        <a href="/admin/security" className="btn btn-primary mt-4">I have saved them</a>
      </div>
    );
  }
  return (
    <form action={run} className="mt-4 space-y-3">
      <div>
        <label htmlFor="code" className="text-sm font-semibold">6-digit code from the app</label>
        <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123 456" className="mt-1 h-12 w-full max-w-xs rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-center text-xl tracking-[0.3em]" />
      </div>
      {state.error && <p role="alert" className="rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{state.error}</p>}
      <button disabled={pending} className="btn btn-primary">{pending ? "Checking…" : "Turn on two-step sign-in"}</button>
    </form>
  );
}
