import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomer } from "@/lib/auth/session";
import { KeepForm } from "@/components/admin/keep-form";
import { F, Msg, Primary, accField } from "@/components/account/auth-fields";
import { registerAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCustomer()) redirect("/account");
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-extrabold">Create an account</h1>
      <p className="mt-1 text-sm text-muted">See your orders, save addresses and keep a wishlist. Optional: guests can still order.</p>
      <div className="mt-5"><Msg error={sp.error} /></div>
      <KeepForm action={registerAction} className="space-y-4">
        <F id="name" label="Full name"><input id="name" name="name" required autoComplete="name" className={accField} /></F>
        <F id="email" label="Email"><input id="email" name="email" type="email" required autoComplete="email" className={accField} /></F>
        <F id="phone" label="Mobile number (optional)"><input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className={accField} /></F>
        <F id="password" label="Password" hint="At least 10 characters, with letters and numbers."><input id="password" name="password" type="password" required autoComplete="new-password" className={accField} /></F>
        <Primary>Create account</Primary>
      </KeepForm>
      <p className="mt-5 text-sm">Already have an account? <Link href="/account/login" className="font-semibold text-accent underline">Sign in</Link></p>
    </div>
  );
}
