import type { Metadata } from "next";
import Link from "next/link";
import { KeepForm } from "@/components/admin/keep-form";
import { F, Msg, Primary, accField } from "@/components/account/auth-fields";
import { resetAction } from "../actions";

export const dynamic = "force-dynamic";
// The reset token is in the URL, so never let this page leak it through the Referer header.
export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const sp = await searchParams;
  if (!sp.token) {
    return <div className="mx-auto max-w-md"><h1 className="text-2xl font-extrabold">This link is incomplete</h1><p className="mt-2 text-muted"><Link href="/account/forgot" className="font-semibold text-accent underline">Request a new reset link</Link></p></div>;
  }
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-extrabold">Choose a new password</h1>
      <div className="mt-5"><Msg error={sp.error} /></div>
      <KeepForm action={resetAction} className="space-y-4">
        <input type="hidden" name="token" value={sp.token} />
        <F id="password" label="New password" hint="At least 10 characters, with letters and numbers."><input id="password" name="password" type="password" required autoComplete="new-password" className={accField} /></F>
        <F id="confirm" label="Confirm new password"><input id="confirm" name="confirm" type="password" required autoComplete="new-password" className={accField} /></F>
        <Primary>Change password</Primary>
      </KeepForm>
    </div>
  );
}
