import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { AuthForm } from "@/components/admin/auth-form";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff sign in", robots: { index: false, follow: false } };

const NOTICE: Record<string, string> = {
  locked: "Too many wrong codes, so that sign-in was cancelled. Enter your password to start again.",
  expired: "That sign-in took too long and has expired. Enter your password to start again.",
};

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const notice = NOTICE[(await searchParams).notice ?? ""];
  if (await getAdmin()) redirect("/admin");
  const none = ((await (await getDb()).query<{ n: number }>("select count(*)::int as n from admin_users"))[0]?.n ?? 0) === 0;
  return (
    <div className="container-x max-w-md py-14">
      <h1 className="text-2xl font-extrabold">Staff sign in</h1>
      <p className="mt-1 text-sm text-muted">Authorised Fixit staff only.</p>
      {notice && <p role="alert" className="mt-4 rounded-[var(--radius-sm)] bg-amber-50 p-3 text-sm font-semibold text-warn">{notice}</p>}
      <AuthForm action={loginAction} mode="login" />
      {none && <p className="mt-6 text-sm">No owner account yet. <Link href="/admin/setup" className="font-semibold text-accent underline">Run first-time setup</Link></p>}
    </div>
  );
}
