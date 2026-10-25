import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomer } from "@/lib/auth/session";
import { KeepForm } from "@/components/admin/keep-form";
import { F, Msg, Primary, accField } from "@/components/account/auth-fields";
import { loginAction, safeNext } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await getCustomer()) redirect(await safeNext(sp.next));
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-extrabold">Sign in</h1>
      <p className="mt-1 text-sm text-muted">An account is optional. You can always check out as a guest.</p>
      <div className="mt-5"><Msg ok={sp.ok} error={sp.error} /></div>
      <KeepForm action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <F id="email" label="Email"><input id="email" name="email" type="email" required autoComplete="username" className={accField} /></F>
        <F id="password" label="Password"><input id="password" name="password" type="password" required autoComplete="current-password" className={accField} /></F>
        <Primary>Sign in</Primary>
      </KeepForm>
      <p className="mt-5 text-sm"><Link href="/account/forgot" className="font-semibold text-accent underline">Forgot your password?</Link></p>
      <p className="mt-2 text-sm">New here? <Link href="/account/register" className="font-semibold text-accent underline">Create an account</Link></p>
    </div>
  );
}
