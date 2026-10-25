import type { Metadata } from "next";
import Link from "next/link";
import { KeepForm } from "@/components/admin/keep-form";
import { F, Msg, Primary, accField } from "@/components/account/auth-fields";
import { forgotAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-extrabold">Reset your password</h1>
      <p className="mt-1 text-sm text-muted">Enter your account email and we will send you a link.</p>
      <div className="mt-5"><Msg ok={sp.ok} error={sp.error} /></div>
      <KeepForm action={forgotAction} className="space-y-4">
        <F id="email" label="Email"><input id="email" name="email" type="email" required autoComplete="email" className={accField} /></F>
        <Primary>Send reset link</Primary>
      </KeepForm>
      <p className="mt-5 text-sm"><Link href="/account/login" className="font-semibold text-accent underline">Back to sign in</Link></p>
    </div>
  );
}
