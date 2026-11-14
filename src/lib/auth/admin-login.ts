import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth/password";
import { setChallengeCookie, startAdminSession } from "@/lib/auth/session";
import { createChallenge, userHasTwoFactor } from "@/lib/auth/two-factor";
import type { Db } from "@/lib/db";

// Hash used to keep login timing similar when the email does not exist.
const DUMMY = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);

/**
 * Admin sign-in used by the customer login too, so staff can use one form. Returns false when the
 * email/password is not an active admin account (the caller then tries the customer login).
 * On success it never returns: it redirects to /admin (or to the two-step code page).
 */
export async function tryAdminSignIn(db: Db, email: string, password: string): Promise<false> {
  const e = email.trim().toLowerCase();
  const rows = await db.query<{ id: string; password_hash: string; active: boolean }>("select id, password_hash, active from admin_users where email = $1", [e]);
  const u = rows[0];
  const ok = await verifyPassword(password, u?.password_hash ?? DUMMY);
  if (!u || !ok || !u.active) return false;
  if (await userHasTwoFactor(db, u.id)) {
    await setChallengeCookie(await createChallenge(db, u.id));
    redirect("/admin/login/verify");
  }
  await startAdminSession(u.id);
  await audit(e, "login", "admin_user", u.id, { via: "customer_form" });
  redirect("/admin");
}
