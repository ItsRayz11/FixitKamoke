import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";

export type Role = "owner" | "manager" | "staff";
const RANK: Record<Role, number> = { staff: 1, manager: 2, owner: 3 };

export interface AdminUser { id: string; email: string; role: Role; displayName: string | null }
export interface CustomerUser { id: string; email: string; name: string; phone: string | null }

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const ADMIN_COOKIE = "fixit_admin";
const CUSTOMER_COOKIE = "fixit_customer";
const ADMIN_TTL_MS = 12 * 3600_000;
const CUSTOMER_TTL_MS = 30 * 24 * 3600_000;

async function setCookie(name: string, token: string, maxAgeMs: number, path: string) {
  (await cookies()).set(name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path,
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

export async function startAdminSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  await (await getDb()).query("insert into admin_sessions(user_id, token_hash, expires_at) values ($1,$2,$3)", [userId, sha(token), new Date(Date.now() + ADMIN_TTL_MS)]);
  await setCookie(ADMIN_COOKIE, token, ADMIN_TTL_MS, "/");
}

const CHALLENGE_COOKIE = "fixit_admin_2fa";
const CHALLENGE_TTL_MS = 5 * 60_000;
/** The short-lived cookie that links a correct password to the second step. It grants no access by itself. */
export async function setChallengeCookie(token: string) { await setCookie(CHALLENGE_COOKIE, token, CHALLENGE_TTL_MS, "/admin"); }
export async function getChallengeCookie() { return (await cookies()).get(CHALLENGE_COOKIE)?.value ?? null; }
export async function clearChallengeCookie() { (await cookies()).set(CHALLENGE_COOKIE, "", { path: "/admin", maxAge: 0 }); }

export async function endAdminSession() {
  const jar = await cookies();
  const t = jar.get(ADMIN_COOKIE)?.value;
  if (t) await (await getDb()).query("delete from admin_sessions where token_hash = $1", [sha(t)]);
  jar.delete(ADMIN_COOKIE);
}

export async function getAdmin(): Promise<AdminUser | null> {
  const t = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!t) return null;
  const rows = await (await getDb()).query<{ id: string; email: string; role: Role; display_name: string | null }>(
    `select u.id, u.email, u.role, u.display_name from admin_sessions s join admin_users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.active`,
    [sha(t)],
  );
  const u = rows[0];
  return u ? { id: u.id, email: u.email, role: u.role, displayName: u.display_name } : null;
}

/** Server-side guard. Call at the top of every admin page and every admin server action. */
export async function requireAdmin(min: Role = "staff"): Promise<AdminUser> {
  const a = await getAdmin();
  if (!a) redirect("/admin/login");
  if (RANK[a.role] < RANK[min]) redirect("/admin?denied=1");
  return a;
}

/** For server actions: throws instead of redirecting so a forged request gets a hard failure. */
export async function assertAdmin(min: Role = "staff"): Promise<AdminUser> {
  const a = await getAdmin();
  if (!a || RANK[a.role] < RANK[min]) throw new Error("Not authorized");
  return a;
}

export const hasRole = (a: AdminUser, min: Role) => RANK[a.role] >= RANK[min];

export async function startCustomerSession(customerId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  await (await getDb()).query("insert into customer_sessions(customer_id, token_hash, expires_at) values ($1,$2,$3)", [customerId, sha(token), new Date(Date.now() + CUSTOMER_TTL_MS)]);
  await setCookie(CUSTOMER_COOKIE, token, CUSTOMER_TTL_MS, "/");
}

export async function endCustomerSession() {
  const jar = await cookies();
  const t = jar.get(CUSTOMER_COOKIE)?.value;
  if (t) await (await getDb()).query("delete from customer_sessions where token_hash = $1", [sha(t)]);
  jar.delete(CUSTOMER_COOKIE);
}

export async function getCustomer(): Promise<CustomerUser | null> {
  const t = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!t) return null;
  const rows = await (await getDb()).query<CustomerUser>(
    `select c.id, c.email, c.name, c.phone from customer_sessions s join customers c on c.id = s.customer_id
     where s.token_hash = $1 and s.expires_at > now() and c.deletion_requested_at is null`,
    [sha(t)],
  );
  return rows[0] ?? null;
}

export async function requireCustomer(): Promise<CustomerUser> {
  const c = await getCustomer();
  if (!c) redirect("/account/login");
  return c;
}
