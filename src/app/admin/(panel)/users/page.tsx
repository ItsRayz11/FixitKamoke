import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { KeepForm } from "@/components/admin/keep-form";
import { Banner, Field, fmtDate, inputCls, Submit, td, th } from "@/components/admin/ui";
import { createStaffAction, setStaffActiveAction } from "../settings-actions";
import { resetStaffTwoFactorAction } from "../security/actions";
import { setFinancePermsAction } from "../finance/actions";
import { FINANCE_PERMS, PERM_LABEL } from "@/lib/finance/perms-core";

export const dynamic = "force-dynamic";

export default async function UsersAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireAdmin("owner");
  const sp = await searchParams;
  const rows = await (await getDb()).query<{ id: string; email: string; role: string; display_name: string | null; active: boolean; created_at: string; two_factor: boolean; finance_perms: string[] }>(
    "select id, email, role, display_name, active, created_at, (totp_enabled_at is not null) as two_factor, finance_perms from admin_users order by created_at");
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-extrabold">Staff accounts</h1>
        <p className="mt-1 text-sm text-muted">Staff can handle orders and repairs. Managers can also edit products, stock, coupons, delivery and blog posts. Only owners see settings, staff and the audit log.</p>
        <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
          <table className="w-full">
            <thead className="border-b border-line"><tr><th className={th}>Name</th><th className={th}>Email</th><th className={th}>Role</th><th className={th}>Two-step</th><th className={th}>Created</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className={td}>{u.display_name ?? "—"}</td><td className={td}>{u.email}</td><td className={td}>{u.role}{!u.active && " (disabled)"}</td><td className={td}>{u.two_factor ? "On" : "Off"}</td><td className={td}>{fmtDate(u.created_at)}</td>
                  <td className={td}>
                    {u.two_factor && u.id !== me.id && (
                      <form action={resetStaffTwoFactorAction}><input type="hidden" name="id" value={u.id} />
                        <button className="min-h-11 text-sm font-semibold underline" aria-label={`Reset two-step sign-in for ${u.email}`}>Reset two-step</button></form>
                    )}
                    {u.role !== "owner" && u.id !== me.id && (
                      <form action={setStaffActiveAction}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="active" value={u.active ? "0" : "1"} />
                        <button className="min-h-11 text-sm font-semibold underline">{u.active ? "Disable" : "Enable"}</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section aria-labelledby="fin-perms" className="mt-6 rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <h2 id="fin-perms" className="font-bold">Finance access</h2>
          <p className="mt-1 text-sm text-muted">The owner sees everything. Staff can use the shop counter by default and never see costs, profit or balances unless you tick them here. Managers get only what you tick.</p>
          <div className="mt-3 space-y-4">
            {rows.filter((u) => u.role !== "owner").map((u) => (
              <form key={u.id} action={setFinancePermsAction} className="rounded border border-line p-3">
                <input type="hidden" name="id" value={u.id} />
                <p className="text-sm font-semibold">{u.display_name ?? u.email} <span className="font-normal text-muted">({u.role})</span></p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {FINANCE_PERMS.map((p) => <label key={p} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={`perm_${p}`} defaultChecked={u.finance_perms.includes(p) || (p === "pos" && u.role === "staff")} className="h-5 w-5" /> {PERM_LABEL[p]}</label>)}
                </div>
                <button className="mt-2 min-h-11 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-semibold text-white">Save access</button>
              </form>
            ))}
          </div>
        </section>
      </div>
      <KeepForm action={createStaffAction} className="h-fit space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <h2 className="font-bold">Add staff member</h2>
        <Field label="Name" id="u-name"><input id="u-name" name="name" required className={inputCls} /></Field>
        <Field label="Email" id="u-email"><input id="u-email" name="email" type="email" required className={inputCls} /></Field>
        <Field label="Role" id="u-role"><select id="u-role" name="role" className={inputCls}><option value="staff">Staff</option><option value="manager">Manager</option></select></Field>
        <Field label="Temporary password" id="u-pw" hint="10+ characters with letters and numbers."><input id="u-pw" name="password" type="password" required autoComplete="new-password" className={inputCls} /></Field>
        <Submit>Create account</Submit>
      </KeepForm>
    </div>
  );
}
