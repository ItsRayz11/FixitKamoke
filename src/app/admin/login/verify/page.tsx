import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdmin, getChallengeCookie } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { challengeUser } from "@/lib/auth/two-factor";
import { TwoFactorForm } from "@/components/admin/two-factor-form";
import { verifyTwoFactorAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verify sign in", robots: { index: false, follow: false } };

export default async function VerifyPage() {
  if (await getAdmin()) redirect("/admin");
  const token = await getChallengeCookie();
  // No live challenge means the password step has not been done (or took too long): start again.
  if (!token || !(await challengeUser(await getDb(), token))) redirect("/admin/login");
  return (
    <div className="container-x max-w-md py-14">
      <h1 className="text-2xl font-extrabold">Check it&apos;s you</h1>
      <p className="mt-1 text-sm text-muted">Open your authenticator app and type the 6-digit code for Fixit.</p>
      <TwoFactorForm action={verifyTwoFactorAction} />
      <p className="mt-6 text-sm"><Link href="/admin/login" className="font-semibold text-accent underline">Back to password</Link></p>
    </div>
  );
}
