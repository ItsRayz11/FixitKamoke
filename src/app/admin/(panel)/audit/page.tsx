import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { fmtDate, td, th } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AuditAdmin() {
  await requireAdmin("owner");
  const rows = await (await getDb()).query<{ id: string; actor: string; action: string; entity: string; entity_id: string | null; detail: unknown; created_at: string }>(
    "select id, actor, action, entity, entity_id, detail, created_at from audit_events order by created_at desc limit 300");
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Audit log</h1>
      <p className="mt-1 text-sm text-muted">The latest 300 sensitive actions. Entries cannot be edited here.</p>
      <div className="mt-4 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>Action</th><th className={th}>Item</th><th className={th}>Details</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td className={td} colSpan={5}>Nothing recorded yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className={`${td} whitespace-nowrap`}>{fmtDate(r.created_at)}</td><td className={td}>{r.actor}</td><td className={td}>{r.action.replace(/_/g, " ")}</td>
                <td className={td}>{r.entity}{r.entity_id ? ` ${r.entity_id.slice(0, 8)}` : ""}</td>
                <td className={`${td} max-w-xs break-words font-mono text-xs`}>{JSON.stringify(r.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
