"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { endAdminSession, startAdminSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export interface FormState { error?: string; ok?: string; values?: { email?: string; name?: string } }

const ip = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
// Hash used to keep login timing similar when the email does not exist.
const DUMMY = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  if (!rateLimit(`admin-login:${await ip()}`, 8, 15 * 60_000)) return { error: "Too many attempts. Try again in a few minutes." };
  const values = { email: String(form.get("email") ?? "") };
  const parsed = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }).safeParse({
    email: form.get("email"), password: form.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password.", values };
  const db = await getDb();
  const rows = await db.query<{ id: string; password_hash: string; active: boolean }>("select id, password_hash, active from admin_users where email = $1", [parsed.data.email]);
  const u = rows[0];
  const ok = await verifyPassword(parsed.data.password, u?.password_hash ?? DUMMY);
  if (!u || !ok || !u.active) {
    await audit(parsed.data.email, "login_failed", "admin_user", null, { ip: await ip() });
    return { error: "Incorrect email or password.", values };
  }
  await startAdminSession(u.id);
  await audit(parsed.data.email, "login", "admin_user", u.id);
  redirect("/admin");
}

export async function logoutAction() {
  await endAdminSession();
  redirect("/admin/login");
}

/** One-time owner creation. Needs ADMIN_SETUP_TOKEN from the server environment and only works while no admin exists. */
export async function setupOwnerAction(_: FormState, form: FormData): Promise<FormState> {
  const values = { email: String(form.get("email") ?? ""), name: String(form.get("name") ?? "") };
  if (!rateLimit(`admin-setup:${await ip()}`, 5, 15 * 60_000)) return { error: "Too many attempts.", values };
  const expected = process.env.ADMIN_SETUP_TOKEN;
  if (!expected || expected.length < 16) return { error: "Setup is disabled. Set ADMIN_SETUP_TOKEN (16+ characters) on the server.", values };
  const token = String(form.get("token") ?? "");
  const a = Buffer.from(token), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { error: "Invalid setup token.", values };

  const parsed = z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().min(2).max(80), password: z.string() }).safeParse({
    email: form.get("email"), name: form.get("name"), password: form.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email, name and password.", values };
  const problem = passwordProblem(parsed.data.password);
  if (problem) return { error: problem, values };

  const db = await getDb();
  const hash = await hashPassword(parsed.data.password);
  // Atomic: insert only if there is no admin yet.
  const created = await db.query<{ id: string }>(
    `insert into admin_users(email, password_hash, role, display_name)
     select $1, $2, 'owner', $3 where not exists (select 1 from admin_users) returning id`,
    [parsed.data.email, hash, parsed.data.name],
  );
  if (!created[0]) return { error: "An owner account already exists. Sign in instead.", values };
  await audit(parsed.data.email, "owner_created", "admin_user", created[0].id);
  await startAdminSession(created[0].id);
  redirect("/admin");
}
