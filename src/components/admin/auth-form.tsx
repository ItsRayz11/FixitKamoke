"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/actions";

const field = "mt-1 h-12 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base";

export function AuthForm({ action, mode }: { action: (s: FormState, f: FormData) => Promise<FormState>; mode: "login" | "setup" }) {
  const [state, run, pending] = useActionState(action, {});
  // React resets uncontrolled inputs after every action, so non-secret values are echoed back through state.
  const v = state.values ?? {};
  return (
    <form action={run} className="mt-6 space-y-4">
      {mode === "setup" && (
        <>
          <div><label htmlFor="token" className="font-semibold">Setup token</label><input id="token" name="token" type="password" required autoComplete="off" className={field} /></div>
          <div><label htmlFor="name" className="font-semibold">Your name</label><input id="name" name="name" required defaultValue={v.name} className={field} /></div>
        </>
      )}
      <div><label htmlFor="email" className="font-semibold">Email</label><input id="email" name="email" type="email" required defaultValue={v.email} autoComplete="username" className={field} /></div>
      <div><label htmlFor="password" className="font-semibold">Password</label><input id="password" name="password" type="password" required autoComplete={mode === "login" ? "current-password" : "new-password"} className={field} /></div>
      {state.error && <p role="alert" className="rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{state.error}</p>}
      <button disabled={pending} className="min-h-12 w-full rounded-[var(--radius-sm)] bg-accent font-semibold text-white hover:bg-accent-strong disabled:bg-slate-300">
        {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create owner account"}
      </button>
    </form>
  );
}
