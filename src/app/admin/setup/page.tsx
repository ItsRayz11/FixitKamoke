import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { AuthForm } from "@/components/admin/auth-form";
import { setupOwnerAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "First-time setup", robots: { index: false, follow: false } };

export default async function AdminSetup() {
  // Hidden once an owner exists, so it cannot be used for public registration.
  const count = (await (await getDb()).query<{ n: number }>("select count(*)::int as n from admin_users"))[0]?.n ?? 0;
  if (count > 0) notFound();
  return (
    <div className="container-x max-w-md py-14">
      <h1 className="text-2xl font-extrabold">Create the owner account</h1>
      <p className="mt-1 text-sm text-muted">One-time setup. You need the ADMIN_SETUP_TOKEN value from the server settings.</p>
      <AuthForm action={setupOwnerAction} mode="setup" />
    </div>
  );
}
