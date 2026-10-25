"use client";

import { useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Admin forms report their result by redirecting back with ?ok=... or ?error=...
 * Two things would otherwise wipe what the user typed when the server rejects a form:
 *   1. React clears inputs after a function passed to <form action> finishes, and
 *   2. changing the query string remounts the whole page in the App Router.
 * So the form is submitted by hand (no automatic reset), the typed values are kept in module memory,
 * and they are put back into the matching form when the page returns with an error.
 * Passwords and files are never remembered. The form is cleared when a success message comes back.
 */
let last: { path: string; sig: string; values: [string, string][] } | null = null;

const isSecret = (el: Field) => el instanceof HTMLInputElement && ["password", "file"].includes(el.type);

/** Identifies a form by its field names plus hidden ids, so several similar forms on a page are told apart. */
function signature(form: HTMLFormElement): string {
  return Array.from(form.elements)
    .filter((e): e is Field => "name" in e && Boolean((e as Field).name))
    .map((el) => (el instanceof HTMLInputElement && el.type === "hidden" ? `${el.name}=${el.value}` : el.name))
    .join("|");
}

export function KeepForm({ action, children, className }: { action: (fd: FormData) => void | Promise<void>; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const sp = useSearchParams();
  const path = usePathname();
  const error = sp.get("error");
  const ok = sp.get("ok");

  useEffect(() => {
    const form = ref.current;
    if (!form || !last || last.path !== path || last.sig !== signature(form)) return;
    if (error) {
      const byName = new Map<string, string[]>();
      for (const [k, v] of last.values) byName.set(k, [...(byName.get(k) ?? []), v]);
      for (const el of Array.from(form.elements) as Field[]) {
        const vals = el.name ? byName.get(el.name) : undefined;
        if (!vals || isSecret(el) || (el instanceof HTMLInputElement && el.type === "hidden")) continue;
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) el.checked = vals.includes(el.value || "on");
        else el.value = vals[0];
      }
    }
    if (error || ok) last = null;
  }, [error, ok, path]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    last = { path, sig: signature(form), values: Array.from(fd.entries()).filter((x): x is [string, string] => typeof x[1] === "string") };
    start(async () => {
      await action(fd);
    });
  }

  return (
    <form ref={ref} className={className} onSubmit={onSubmit} aria-busy={pending}>
      {children}
    </form>
  );
}
