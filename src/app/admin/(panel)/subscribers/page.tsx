import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { activeSubscribers } from "@/lib/marketing";
import { fmtDate, td, th } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function SubscribersAdmin() {
  await requireAdmin("manager");
  const subs = await activeSubscribers(await getDb());
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold">Email list</h1>
      <p className="mt-1 text-sm text-muted">People who ticked the consent box and have not unsubscribed. Customers who only placed an order are not on this list. Include each person’s unsubscribe link in every marketing email.</p>
      <p className="mt-3 text-sm"><strong>{subs.length}</strong> active subscriber{subs.length === 1 ? "" : "s"}. {subs.length > 0 && <a href="/admin/subscribers/export" className="font-semibold text-accent underline">Download CSV</a>}</p>
      <div className="mt-4 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>Email</th><th className={th}>Consent given</th><th className={th}>Source</th></tr></thead>
          <tbody className="divide-y divide-line">
            {subs.length === 0 && <tr><td className={td} colSpan={3}>No subscribers yet.</td></tr>}
            {subs.map((s) => <tr key={s.email}><td className={td}>{s.email}</td><td className={td}>{fmtDate(s.consentedAt)}</td><td className={td}>{s.source}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
