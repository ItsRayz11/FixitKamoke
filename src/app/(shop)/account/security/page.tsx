import type { Metadata } from "next";
import { requireCustomer } from "@/lib/auth/session";
import { AccountNav } from "@/components/account/account-nav";
import { KeepForm } from "@/components/admin/keep-form";
import { F, Msg, Primary, accField } from "@/components/account/auth-fields";
import { changePasswordAction, deleteAccountAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireCustomer();
  const sp = await searchParams;
  return (
    <>
      <AccountNav name={me.name} current="/account/security" />
      <h1 className="text-2xl font-extrabold">Account security</h1>
      <div className="mt-4"><Msg ok={sp.ok} error={sp.error} /></div>
      <div className="grid gap-6 md:grid-cols-2">
        <KeepForm action={changePasswordAction} className="h-fit space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <h2 className="font-bold">Change password</h2>
          <F id="current" label="Current password"><input id="current" name="current" type="password" required autoComplete="current-password" className={accField} /></F>
          <F id="password" label="New password" hint="At least 10 characters, with letters and numbers."><input id="password" name="password" type="password" required autoComplete="new-password" className={accField} /></F>
          <F id="confirm" label="Confirm new password"><input id="confirm" name="confirm" type="password" required autoComplete="new-password" className={accField} /></F>
          <Primary>Change password</Primary>
        </KeepForm>
        <KeepForm action={deleteAccountAction} className="h-fit space-y-3 rounded-[var(--radius-md)] border border-red-200 bg-surface p-4">
          <h2 className="font-bold text-danger">Delete my account</h2>
          <p className="text-sm text-muted">This removes your account, saved addresses and wishlist. Past orders are kept for our records without a link to your account. It cannot be undone.</p>
          <F id="del-password" label="Your password"><input id="del-password" name="password" type="password" required autoComplete="current-password" className={accField} /></F>
          <F id="del-confirm" label="Type DELETE to confirm"><input id="del-confirm" name="confirm" required autoComplete="off" className={accField} /></F>
          <Primary danger>Delete my account</Primary>
        </KeepForm>
      </div>
    </>
  );
}
