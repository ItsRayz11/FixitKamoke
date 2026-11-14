import { redirect } from "next/navigation";
import { getAdmin, type AdminUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { can, permsFor, type FinancePerm } from "./perms-core";

/**
 * Finance permissions. Owner always has all. A manager has only what the owner assigns. Staff get counter sales ("pos") by default and
 * nothing that shows cost, profit or balances unless the owner grants it. Enforced in every server action and page, not just by hiding menus.
 */
export { FINANCE_PERMS, PERM_LABEL, can, permsFor, type FinancePerm } from "./perms-core";

export interface FinanceUser extends AdminUser { perms: FinancePerm[] }

async function load(a: AdminUser | null): Promise<FinanceUser | null> {
  if (!a) return null;
  const r = await (await getDb()).query<{ finance_perms: string[] }>("select finance_perms from admin_users where id = $1 and active", [a.id]);
  return r[0] ? { ...a, perms: permsFor(a.role, r[0].finance_perms ?? []) } : null;
}

/** For pages: redirects to the login or the dashboard when not allowed. */
export async function requireFinance(perm: FinancePerm): Promise<FinanceUser> {
  const a = await getAdmin();
  if (!a) redirect("/admin/login");
  const u = await load(a);
  if (!u || !can(u, perm)) redirect("/admin?denied=1");
  return u;
}

/** For server actions: throws, so a forged request gets a hard failure. */
export async function assertFinance(perm: FinancePerm): Promise<FinanceUser> {
  const u = await load(await getAdmin());
  if (!u || !can(u, perm)) throw new Error("Not authorized");
  return u;
}

/** Which finance permissions the signed-in admin has (for building the menu). */
export async function financePermsOf(a: AdminUser): Promise<FinancePerm[]> {
  return (await load(a))?.perms ?? [];
}
