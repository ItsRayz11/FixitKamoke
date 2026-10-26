"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { beginSetup, checkCurrentCode, confirmSetup, disableTwoFactor, TwoFactorError } from "@/lib/auth/two-factor";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { flash } from "@/lib/admin/flash";

export interface SetupState { error?: string; codes?: string[] }

export async function startSetupAction() {
  const me = await assertAdmin("staff");
  try {
    await beginSetup(await getDb(), me.id);
  } catch (e) {
    if (e instanceof TwoFactorError) flash("/admin/security", { error: e.message });
    throw e;
  }
  await audit(me.email, "two_factor_setup_started", "admin_user", me.id);
  redirect("/admin/security");
}

export async function confirmSetupAction(_: SetupState, form: FormData): Promise<SetupState> {
  const me = await assertAdmin("staff");
  if (!rateLimit(`2fa-confirm:${me.id}`, 10, 15 * 60_000)) return { error: "Too many attempts. Try again in a few minutes." };
  try {
    const codes = await confirmSetup(await getDb(), me.id, String(form.get("code") ?? ""));
    if (!codes) return { error: "That code is not right. Check the code in your app (it changes every 30 seconds) and try again." };
    await audit(me.email, "two_factor_enabled", "admin_user", me.id);
    return { codes };
  } catch (e) {
    if (e instanceof TwoFactorError) return { error: e.message };
    throw e;
  }
}

/** Turning it off needs both the account password and a current code, so a borrowed signed-in browser cannot weaken the account. */
export async function disableSetupAction(form: FormData) {
  const me = await assertAdmin("staff");
  if (!rateLimit(`2fa-disable:${me.id}`, 6, 15 * 60_000)) flash("/admin/security", { error: "Too many attempts. Try again in a few minutes." });
  const db = await getDb();
  const row = (await db.query<{ password_hash: string }>("select password_hash from admin_users where id = $1", [me.id]))[0];
  const passwordOk = row ? await verifyPassword(String(form.get("password") ?? ""), row.password_hash) : false;
  const codeOk = passwordOk && (await checkCurrentCode(db, me.id, String(form.get("code") ?? "")));
  if (!passwordOk || !codeOk) {
    await audit(me.email, "two_factor_disable_refused", "admin_user", me.id);
    flash("/admin/security", { error: "Password or code was not right, so two-step sign-in stays on." });
  }
  await disableTwoFactor(db, me.id);
  await audit(me.email, "two_factor_disabled", "admin_user", me.id);
  flash("/admin/security", { ok: "Two-step sign-in is off." });
}

/** For a staff member who lost their phone and recovery codes. Owner only; they can then set it up again. */
export async function resetStaffTwoFactorAction(form: FormData) {
  const owner = await assertAdmin("owner");
  const id = String(form.get("id") ?? "");
  const db = await getDb();
  const target = (await db.query<{ email: string }>("select email from admin_users where id = $1", [id]))[0];
  if (!target) flash("/admin/users", { error: "Account not found." });
  await disableTwoFactor(db, id);
  await db.query("delete from admin_sessions where user_id = $1", [id]); // sign them out everywhere
  await audit(owner.email, "two_factor_reset", "admin_user", id, { target: target.email });
  flash("/admin/users", { ok: `Two-step sign-in reset for ${target.email}. They have been signed out.` });
}
