import crypto from "node:crypto";
import { z } from "zod";
import type { Db, Queryable } from "@/lib/db";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { normalizePkMobile } from "@/lib/domain/phone";

export class CustomerError extends Error {
  constructor(public code: "exists" | "bad_credentials" | "weak_password" | "bad_token" | "invalid" | "not_found", message: string) { super(message); }
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address").max(200),
  phone: z.string().trim().max(20).optional().or(z.literal("").transform(() => undefined)),
  password: z.string().max(200),
});

export async function registerCustomer(db: Db, raw: unknown): Promise<string> {
  const d = registerSchema.parse(raw);
  const problem = passwordProblem(d.password);
  if (problem) throw new CustomerError("weak_password", problem);
  let phone: string | null = null;
  if (d.phone) {
    phone = normalizePkMobile(d.phone);
    if (!phone) throw new CustomerError("invalid", "Please enter a valid Pakistani mobile number.");
  }
  const hash = await hashPassword(d.password);
  try {
    const r = await db.query<{ id: string }>("insert into customers(email, password_hash, name, phone) values ($1,$2,$3,$4) returning id", [d.email, hash, d.name, phone]);
    return r[0].id;
  } catch (e) {
    if (/duplicate key/.test(String(e))) throw new CustomerError("exists", "An account with this email already exists. Try signing in.");
    throw e;
  }
}

/** Constant-ish time: verifies against a dummy hash when the email is unknown so timing does not reveal accounts. */
export async function authenticateCustomer(db: Db, email: string, password: string): Promise<string> {
  const rows = await db.query<{ id: string; password_hash: string; deletion_requested_at: Date | null }>(
    "select id, password_hash, deletion_requested_at from customers where email = $1", [email.trim().toLowerCase()]);
  const c = rows[0];
  const ok = await verifyPassword(password, c?.password_hash ?? DUMMY_HASH);
  if (!c || !ok || c.deletion_requested_at) throw new CustomerError("bad_credentials", "Incorrect email or password.");
  return c.id;
}

/** Creates a reset token for the email if an account exists. Returns the plaintext token (to be emailed) or null. */
export async function createPasswordReset(db: Db, email: string): Promise<{ token: string; email: string } | null> {
  const rows = await db.query<{ id: string }>("select id from customers where email = $1 and deletion_requested_at is null", [email.trim().toLowerCase()]);
  if (!rows[0]) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  await db.tx(async (q) => {
    await q.query("update password_resets set used_at = now() where customer_id = $1 and used_at is null", [rows[0].id]); // only the newest link works
    await q.query("insert into password_resets(customer_id, token_hash, expires_at) values ($1,$2, now() + interval '1 hour')", [rows[0].id, sha(token)]);
    await q.query(
      "insert into notification_outbox(kind, recipient, payload, dedupe_key) values ('password_reset', $1, $2, $3)",
      [email.trim().toLowerCase(), JSON.stringify({ resetToken: token }), `password_reset:${sha(token).slice(0, 24)}`]);
  });
  return { token, email: email.trim().toLowerCase() };
}

export async function resetPassword(db: Db, token: string, newPassword: string): Promise<void> {
  const problem = passwordProblem(newPassword);
  if (problem) throw new CustomerError("weak_password", problem);
  const hash = await hashPassword(newPassword);
  await db.tx(async (q) => {
    const rows = await q.query<{ id: string; customer_id: string }>(
      "update password_resets set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning id, customer_id", [sha(token)]);
    if (!rows[0]) throw new CustomerError("bad_token", "This reset link is invalid or has expired. Please request a new one.");
    await q.query("update customers set password_hash = $2 where id = $1", [rows[0].customer_id, hash]);
    await q.query("delete from customer_sessions where customer_id = $1", [rows[0].customer_id]); // sign out everywhere
  });
}

export async function changePassword(db: Db, customerId: string, current: string, next: string): Promise<void> {
  const problem = passwordProblem(next);
  if (problem) throw new CustomerError("weak_password", problem);
  const c = (await db.query<{ password_hash: string }>("select password_hash from customers where id = $1", [customerId]))[0];
  if (!c || !(await verifyPassword(current, c.password_hash))) throw new CustomerError("bad_credentials", "Your current password is not correct.");
  await db.query("update customers set password_hash = $2 where id = $1", [customerId, await hashPassword(next)]);
}

/** Deletes the account after the password is confirmed. Orders stay (customer link removed) because they are business records. */
export async function deleteCustomerAccount(db: Db, customerId: string, password: string): Promise<void> {
  const c = (await db.query<{ password_hash: string }>("select password_hash from customers where id = $1", [customerId]))[0];
  if (!c || !(await verifyPassword(password, c.password_hash))) throw new CustomerError("bad_credentials", "That password is not correct.");
  await db.query("delete from customers where id = $1", [customerId]);
}

export interface Address { id: string; label: string; recipientName: string; phone: string; city: string; area: string | null; address: string; isDefault: boolean }

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(30),
  recipientName: z.string().trim().min(2, "Please enter the recipient's name").max(100),
  phone: z.string().trim().min(10, "Please enter a valid Pakistani mobile number.").max(20),
  city: z.string().trim().min(2, "Please enter the city").max(80),
  area: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
  address: z.string().trim().min(8, "Please enter the complete address").max(500),
  isDefault: z.boolean(),
});

export async function listAddresses(db: Queryable, customerId: string): Promise<Address[]> {
  const r = await db.query<{ id: string; label: string; recipient_name: string; phone: string; city: string; area: string | null; address: string; is_default: boolean }>(
    "select id, label, recipient_name, phone, city, area, address, is_default from customer_addresses where customer_id = $1 order by is_default desc, label", [customerId]);
  return r.map((a) => ({ id: a.id, label: a.label, recipientName: a.recipient_name, phone: a.phone, city: a.city, area: a.area, address: a.address, isDefault: a.is_default }));
}

export async function saveAddress(db: Db, customerId: string, raw: unknown, id?: string): Promise<void> {
  const d = addressSchema.parse(raw);
  const phone = normalizePkMobile(d.phone);
  if (!phone) throw new CustomerError("invalid", "Please enter a valid Pakistani mobile number.");
  await db.tx(async (q) => {
    if ((await q.query<{ n: number }>("select count(*)::int as n from customer_addresses where customer_id = $1", [customerId]))[0].n >= 10 && !id) {
      throw new CustomerError("invalid", "You can save up to 10 addresses.");
    }
    if (d.isDefault) await q.query("update customer_addresses set is_default = false where customer_id = $1", [customerId]);
    if (id) {
      const r = await q.query("update customer_addresses set label=$3, recipient_name=$4, phone=$5, city=$6, area=$7, address=$8, is_default=$9 where id=$1 and customer_id=$2 returning id",
        [id, customerId, d.label, d.recipientName, phone, d.city, d.area ?? null, d.address, d.isDefault]);
      if (!r[0]) throw new CustomerError("not_found", "Address not found.");
    } else {
      await q.query("insert into customer_addresses(customer_id, label, recipient_name, phone, city, area, address, is_default) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [customerId, d.label, d.recipientName, phone, d.city, d.area ?? null, d.address, d.isDefault]);
    }
  });
}

export async function deleteAddress(db: Db, customerId: string, id: string): Promise<void> {
  await db.query("delete from customer_addresses where id = $1 and customer_id = $2", [id, customerId]);
}

export async function toggleWishlist(db: Db, customerId: string, productId: string): Promise<boolean> {
  const del = await db.query("delete from wishlist_items where customer_id = $1 and product_id = $2 returning product_id", [customerId, productId]);
  if (del[0]) return false;
  await db.query("insert into wishlist_items(customer_id, product_id) select $1, id from products where id = $2 and published", [customerId, productId]);
  return true;
}
